import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Order, OrderItem, Payment, Prisma, Subscription, SubscriptionTerm } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { HttpError } from '@/lib/http/errors';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/settings/store';
import { sendTemplate, ownerEmail } from '@/lib/mail/send';
import type { Placeholder, TemplateId } from '@/lib/mail/templates';
import { baseUrl } from '@/lib/url';
import { formatMinor } from '@/lib/checkout/money';
import { computeTotals, quoteFor, type PackagePricing } from '@/lib/checkout/pricing';
import { paymentSettings } from '@/lib/checkout/settings';
import { orderNumber } from '@/lib/checkout/numbers';
import { addDays, addMonths, daysUntil, isSubPeriod, monthsIn, nextTerm, parseReminderDays, planCycle, reminderKey, SUB_PERIOD_LABEL, SUB_STATUS_LABEL, type SubPeriod, type SubStatusId } from './schedule';
import { affiliateSettings } from '@/lib/growth/settings';
import { subscriptionSettings, type SubscriptionSettings } from './settings';

type Json = Prisma.InputJsonValue;
type Entry = Record<string, unknown>;
type Tx = Prisma.TransactionClient;

export type FullSubscription = Subscription & { terms: SubscriptionTerm[] };
type PaidOrder = Order & { items: OrderItem[]; payments: Payment[] };

const NUMBER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const arr = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);
const nowIso = () => new Date().toISOString();
const OPEN_ORDER_STATES = ['PENDING_PAYMENT', 'VERIFYING', 'FAILED'] as const;

export function subscriptionNumber(prefix: string, date = new Date()): string {
  const d = date.toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = randomBytes(4);
  return `${prefix}-${d}-${[...bytes].map((b) => NUMBER_CHARS[b % NUMBER_CHARS.length]).join('')}`;
}

export const customerNameOf = (s: Pick<Subscription, 'customer'>) => String((s.customer as Entry | null)?.name ?? 'there');
const longDate = (d: Date) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- reading ----------

const withTerms = { terms: { orderBy: { periodEnd: 'desc' as const } } };
export const getSubscriptionByToken = (token: string) => getDb().subscription.findUnique({ where: { token }, include: withTerms });
export const getSubscriptionById = (id: string) => getDb().subscription.findUnique({ where: { id }, include: withTerms });

/** The renewal (or restart) order that is still waiting for payment, if any. */
export async function openRenewalOrder(subscriptionId: string) {
  return getDb().order.findFirst({
    where: { subscriptionId, status: { in: [...OPEN_ORDER_STATES] }, items: { some: { kind: 'renewal' } } },
    include: { items: true, payments: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------- history and email helpers ----------

async function addHistory(db: Tx | ReturnType<typeof getDb>, id: string, entry: { by: string; from: string | null; to: string; note?: string }) {
  const row = await db.subscription.findUnique({ where: { id }, select: { history: true } });
  await db.subscription.update({ where: { id }, data: { history: [...arr(row?.history), { at: nowIso(), ...entry }] as Json } });
}

async function vars(sub: Subscription, extra: Partial<Record<Placeholder, string>> = {}): Promise<Partial<Record<Placeholder, string>>> {
  const base = await baseUrl();
  const manage = `${base}/subscription/${sub.token}`;
  return {
    name: customerNameOf(sub),
    number: sub.number,
    plan: sub.title,
    period: sub.period,
    ends: longDate(sub.currentPeriodEnd),
    total: formatMinor(sub.amount, sub.currency),
    link: manage,
    manage_link: manage,
    status: SUB_STATUS_LABEL[sub.status as SubStatusId] ?? sub.status,
    ...extra,
  };
}

async function mailCustomer(sub: Subscription, template: TemplateId, extra: Partial<Record<Placeholder, string>> = {}): Promise<boolean> {
  return sendTemplate(template, sub.email, await vars(sub, extra), { entity: 'subscription', entityId: sub.id });
}

async function alertOwner(sub: Subscription, message: string, settings?: SubscriptionSettings): Promise<void> {
  const cfg = settings ?? (await getSetting(subscriptionSettings));
  if (!cfg.ownerAlerts) return;
  const owner = await ownerEmail();
  if (owner) await sendTemplate('owner.subscription', owner, await vars(sub, { message, link: `${await baseUrl()}/admin/subscriptions/${sub.id}` }), { entity: 'subscription', entityId: sub.id });
}

// ---------- starting a subscription from a paid order ----------

interface PackageSnapshot {
  package?: { id?: string; name?: string; billing?: string };
  service?: { name?: string };
  period?: string;
}

/**
 * Paid-order handler. A paid package order that bills monthly or yearly starts a subscription; a paid renewal
 * order extends one. A failing handler never undoes the payment (orders.ts logs it and carries on).
 */
export async function handlePaidOrder(order: PaidOrder): Promise<void> {
  for (const item of order.items) {
    if (item.kind === 'renewal') await applyRenewalPaid(order, item);
    else if (item.kind === 'package') await startFromPackageOrder(order, item);
  }
}

async function startFromPackageOrder(order: PaidOrder, item: OrderItem): Promise<void> {
  const snap = (item.snapshot ?? {}) as PackageSnapshot;
  const billing = snap.package?.billing;
  const period = snap.period;
  if ((billing !== 'MONTHLY' && billing !== 'YEARLY') || !isSubPeriod(period)) return;
  // Switching the module off stops new plans from starting; renewals of existing plans always go through.
  if (!(await isOn('subscriptions'))) return;

  const db = getDb();
  const settings = await getSetting(subscriptionSettings);
  const start = order.paidAt ?? new Date();
  const anchorDay = start.getUTCDate();
  const end = addMonths(start, monthsIn(period), anchorDay);
  const title = snap.service?.name && snap.package?.name ? `${snap.service.name}: ${snap.package.name}` : item.title;
  const packageId = snap.package?.id ?? null;
  const known = packageId ? await db.package.findUnique({ where: { id: packageId }, select: { id: true } }) : null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const sub = await db.$transaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            number: subscriptionNumber(settings.numberPrefix),
            token: randomBytes(32).toString('base64url'),
            userId: order.userId,
            email: order.email,
            customer: (order.customer ?? {}) as Json,
            packageId: known?.id ?? null,
            title,
            period,
            currency: order.currency,
            amount: item.unitPrice,
            anchorDay,
            startedAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            snapshot: { package: snap.package ?? null, service: snap.service ?? null, period, firstOrder: order.number } as Json,
            history: [{ at: nowIso(), by: 'system', from: null, to: 'ACTIVE', note: `Started from order ${order.number}` }] as Json,
          },
        });
        // The unique order id on the term stops a repeated paid event from starting a second plan.
        await tx.subscriptionTerm.create({ data: { subscriptionId: created.id, orderId: order.id, kind: 'first', periodStart: start, periodEnd: end, amount: item.unitPrice } });
        await tx.order.update({ where: { id: order.id }, data: { subscriptionId: created.id } });
        return created;
      });
      await mailCustomer(sub, 'subscription.started');
      await alertOwner(sub, `${customerNameOf(sub)} started ${sub.title} (${SUB_PERIOD_LABEL[period].toLowerCase()}, ${formatMinor(sub.amount, sub.currency)}). It runs until ${longDate(end)}.`, settings);
      return;
    } catch (error) {
      if (!isUnique(error)) throw error;
      const already = await db.subscriptionTerm.findUnique({ where: { orderId: order.id }, select: { id: true } });
      if (already) return;
    }
  }
  throw new Error(`Could not create a subscription number for order ${order.number}`);
}

async function applyRenewalPaid(order: PaidOrder, item: OrderItem): Promise<void> {
  const db = getDb();
  const sub = await db.subscription.findUnique({ where: { id: item.refId } });
  if (!sub) throw new Error(`Renewal order ${order.number} points at a subscription that no longer exists`);
  const now = order.paidAt ?? new Date();
  let updated: Subscription;
  let kind: 'renewal' | 'restart';
  try {
    ({ updated, kind } = await db.$transaction(async (tx) => {
      const fresh = (await tx.subscription.findUnique({ where: { id: sub.id } })) as Subscription;
      const period = (isSubPeriod(fresh.period) ? fresh.period : 'monthly') as SubPeriod;
      const plan = nextTerm({ currentEnd: fresh.currentPeriodEnd, status: fresh.status as SubStatusId, period, anchorDay: fresh.anchorDay, now });
      const restarting = plan.kind === 'restart';
      await tx.subscriptionTerm.create({ data: { subscriptionId: fresh.id, orderId: order.id, kind: plan.kind, periodStart: plan.start, periodEnd: plan.end, amount: item.unitPrice } });
      const row = await tx.subscription.update({
        where: { id: fresh.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: plan.start,
          currentPeriodEnd: plan.end,
          renewals: restarting ? fresh.renewals : fresh.renewals + 1,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          endedAt: null,
          remindersSent: [],
          ...(restarting ? { anchorDay: now.getUTCDate() } : {}),
        },
      });
      await addHistory(tx, fresh.id, { by: 'system', from: fresh.status, to: 'ACTIVE', note: `${restarting ? 'Started again' : 'Renewed'} with order ${order.number}. Now runs until ${longDate(plan.end)}.` });
      await tx.order.update({ where: { id: order.id }, data: { subscriptionId: fresh.id } });
      return { updated: row, kind: plan.kind };
    }));
  } catch (error) {
    if (isUnique(error)) return;
    throw error;
  }
  await mailCustomer(updated, 'subscription.renewed', { total: formatMinor(order.total, order.currency), invoice_link: order.invoiceNumber ? `${await baseUrl()}/invoice/${order.token}` : '' });
  if (kind === 'restart') await alertOwner(updated, `${customerNameOf(updated)} started ${updated.title} again. It runs until ${longDate(updated.currentPeriodEnd)}.`);
}

// ---------- renewal orders ----------

/** What one term costs now, before tax. Locked unless the owner chose to follow the package price. */
export async function renewalAmount(sub: Subscription, settings: SubscriptionSettings): Promise<number> {
  if (settings.renewalPrice !== 'current' || !sub.packageId) return sub.amount;
  const pkg = await getDb().package.findUnique({ where: { id: sub.packageId } });
  if (!pkg || !pkg.active || pkg.mode !== 'buy' || pkg.currency !== sub.currency) return sub.amount;
  try {
    const unit = quoteFor(pkg as PackagePricing, sub.period).unit;
    return unit > 0 ? unit : sub.amount;
  } catch {
    return sub.amount;
  }
}

/**
 * Creates the order the customer pays to renew (or to start again). One open renewal order per subscription:
 * asking twice returns the one that exists. Tax is worked out again from today's payment settings.
 */
export async function createRenewalOrder(subscriptionId: string, by: string): Promise<{ order: PaidOrder; created: boolean }> {
  const db = getDb();
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new HttpError(404, 'This subscription no longer exists.');
  const existing = await openRenewalOrder(sub.id);
  if (existing) return { order: existing, created: false };

  const [settings, pay] = await Promise.all([getSetting(subscriptionSettings), getSetting(paymentSettings)]);
  const amount = await renewalAmount(sub, settings);
  const totals = computeTotals({ subtotal: amount, taxRatePct: pay.taxRatePct, taxInclusive: pay.taxInclusive });
  // Renewals earn the original affiliate commission only when the owner allows recurring commission.
  let affiliateId: string | null = null;
  if ((await getSetting(affiliateSettings)).recurring && (await isOn('affiliates'))) {
    const first = await db.subscriptionTerm.findFirst({ where: { subscriptionId: sub.id, orderId: { not: null } }, orderBy: { periodStart: 'asc' }, include: { order: { select: { affiliateId: true } } } });
    affiliateId = first?.order?.affiliateId ?? null;
  }
  const restart = sub.status === 'EXPIRED' || sub.status === 'CANCELLED';
  const period = (isSubPeriod(sub.period) ? sub.period : 'monthly') as SubPeriod;
  const plan = nextTerm({ currentEnd: sub.currentPeriodEnd, status: sub.status as SubStatusId, period, anchorDay: sub.anchorDay, now: new Date() });
  const title = `${sub.title} ${restart ? 'restart' : 'renewal'} (${SUB_PERIOD_LABEL[period].toLowerCase()})`;
  const snapshot = { subscription: { id: sub.id, number: sub.number, period }, restart, term: { start: plan.start.toISOString(), end: plan.end.toISOString() }, tax: { ratePct: pay.taxRatePct, inclusive: pay.taxInclusive, label: pay.taxLabel } };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const order = await db.order.create({
        data: {
          number: orderNumber(pay.orderPrefix),
          token: randomBytes(32).toString('base64url'),
          userId: sub.userId,
          email: sub.email,
          customer: (sub.customer ?? {}) as Json,
          currency: sub.currency,
          ...totals,
          affiliateId,
          subscriptionId: sub.id,
          history: [{ at: nowIso(), by, from: null, to: 'PENDING_PAYMENT', note: restart ? 'Restart invoice created' : 'Renewal invoice created' }] as Json,
          items: { create: [{ kind: 'renewal', refId: sub.id, title, quantity: 1, unitPrice: amount, snapshot: snapshot as Json }] },
        },
        include: { items: true, payments: true },
      });
      await addHistory(db, sub.id, { by, from: sub.status, to: sub.status, note: `${restart ? 'Restart' : 'Renewal'} invoice ${order.number} created for ${formatMinor(order.total, order.currency)}` });
      return { order, created: true };
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  throw new HttpError(500, 'Could not create an order number. Please try again.');
}

/** Cancels renewal orders that nobody has paid or sent proof for (the term they were for has changed or the plan ended). */
export async function cancelOpenRenewals(subscriptionId: string, by: string, note: string): Promise<number> {
  const db = getDb();
  const open = await db.order.findMany({ where: { subscriptionId, status: { in: ['PENDING_PAYMENT', 'FAILED'] }, items: { some: { kind: 'renewal' } } }, select: { id: true, status: true, history: true } });
  for (const o of open) {
    const changed = await db.order.updateMany({ where: { id: o.id, status: { in: ['PENDING_PAYMENT', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    if (changed.count) await db.order.update({ where: { id: o.id }, data: { history: [...arr(o.history), { at: nowIso(), by, from: o.status, to: 'CANCELLED', note }] as Json } });
  }
  return open.length;
}

async function emailRenewal(sub: Subscription, order: PaidOrder, template: TemplateId, extra: Partial<Record<Placeholder, string>> = {}) {
  const base = await baseUrl();
  return mailCustomer(sub, template, { total: formatMinor(order.total, order.currency), link: `${base}/order/${order.token}`, ...extra });
}

// ---------- the daily cycle ----------

export interface CycleSummary {
  checked: number;
  renewalsCreated: number;
  reminders: number;
  pastDue: number;
  ended: number;
  expired: number;
  failed: number;
}

/**
 * Looks at every running subscription and does what `planCycle` says: creates renewal invoices, sends
 * reminders, starts the grace period, ends plans that were set not to renew, and expires unpaid ones.
 * Safe to run any number of times a day: each step records what it did.
 */
export async function runCycle(now = new Date(), limit = 500): Promise<CycleSummary> {
  const db = getDb();
  const settings = await getSetting(subscriptionSettings);
  const cfg = { leadDays: settings.leadDays, reminderDays: parseReminderDays(settings.reminderDays) ?? [], graceDays: settings.graceDays };
  const summary: CycleSummary = { checked: 0, renewalsCreated: 0, reminders: 0, pastDue: 0, ended: 0, expired: 0, failed: 0 };
  const subs = await db.subscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] } }, orderBy: { currentPeriodEnd: 'asc' }, take: limit });

  for (const sub of subs) {
    summary.checked += 1;
    try {
      const open = await openRenewalOrder(sub.id);
      const plan = planCycle({ status: sub.status as SubStatusId, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, hasOpenRenewal: Boolean(open), remindersSent: sub.remindersSent }, now, cfg);

      if (plan.end) {
        await db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', endedAt: sub.currentPeriodEnd } });
        await addHistory(db, sub.id, { by: 'system', from: sub.status, to: 'CANCELLED', note: 'The plan reached its end date and was set not to renew.' });
        await cancelOpenRenewals(sub.id, 'system', 'The plan ended');
        const ended = (await getSubscriptionById(sub.id)) as Subscription;
        await mailCustomer(ended, 'subscription.ended', { message: settings.customerCanRestart ? 'If you would like to start again, you can do that from your plan page.' : '' });
        await alertOwner(ended, `${customerNameOf(ended)}'s plan ${ended.title} ended as requested.`, settings);
        summary.ended += 1;
      } else if (plan.becomePastDue) {
        const { order } = open ? { order: open } : await createRenewalOrder(sub.id, 'system');
        await db.subscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
        await addHistory(db, sub.id, { by: 'system', from: 'ACTIVE', to: 'PAST_DUE', note: settings.graceDays > 0 ? `The renewal was not paid by the end date. The plan stays active for ${plural(settings.graceDays, 'more day')}.` : 'The renewal was not paid by the end date.' });
        const graceEnds = addDays(sub.currentPeriodEnd, settings.graceDays);
        const message = settings.graceDays > 0 ? `To avoid any gap, we are keeping your plan active until ${longDate(graceEnds)}. Please pay the renewal (${formatMinor(order.total, order.currency)}) by then.` : `Please pay the renewal (${formatMinor(order.total, order.currency)}) to continue.`;
        await emailRenewal((await getSubscriptionById(sub.id)) as Subscription, order, 'subscription.past_due', { message });
        summary.pastDue += 1;
        if (!open) summary.renewalsCreated += 1;
      } else if (plan.expire) {
        await db.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED', endedAt: now } });
        await addHistory(db, sub.id, { by: 'system', from: 'PAST_DUE', to: 'EXPIRED', note: 'The grace period ended without payment.' });
        await cancelOpenRenewals(sub.id, 'system', 'The plan expired');
        const expired = (await getSubscriptionById(sub.id)) as Subscription;
        await mailCustomer(expired, 'subscription.expired', { message: settings.customerCanRestart ? 'You can start again at any time from your plan page.' : 'Please contact us if you would like to continue.' });
        await alertOwner(expired, `${customerNameOf(expired)}'s plan ${expired.title} expired because the renewal was not paid.`, settings);
        summary.expired += 1;
      } else {
        if (plan.createRenewal) {
          const { order } = await createRenewalOrder(sub.id, 'system');
          await emailRenewal(sub, order, 'subscription.renewal_due');
          summary.renewalsCreated += 1;
        } else if (plan.remind !== null && open) {
          const days = daysUntil(sub.currentPeriodEnd, now);
          await emailRenewal(sub, open, 'subscription.reminder', { days: plural(Math.max(1, days), 'day') });
          summary.reminders += 1;
        }
        if (plan.covered.length) {
          await db.subscription.update({ where: { id: sub.id }, data: { remindersSent: [...new Set([...sub.remindersSent, ...plan.covered.map((d) => reminderKey(sub.currentPeriodEnd, d))])] } });
        }
      }
    } catch (error) {
      summary.failed += 1;
      console.error(`[subscriptions] cycle failed for ${sub.number}`, error);
    }
  }
  return summary;
}

// ---------- what customers and staff can do ----------

export interface Actor {
  /** "customer", "system" or a staff name. */
  by: string;
  staffId?: string;
  isStaff: boolean;
}

/** Stop renewing: the plan keeps working until the end of the paid term, then ends. */
export async function stopRenewing(sub: Subscription, actor: Actor, note?: string): Promise<void> {
  if (sub.status !== 'ACTIVE') throw new HttpError(409, 'Only an active plan can be set not to renew.');
  if (sub.cancelAtPeriodEnd) return;
  const settings = await getSetting(subscriptionSettings);
  if (!actor.isStaff && !settings.customerCanStop) throw new HttpError(403, 'Please contact us to stop this plan.');
  const db = getDb();
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, cancelledAt: new Date() } });
  await addHistory(db, sub.id, { by: actor.by, from: sub.status, to: sub.status, note: 'Set not to renew' });
  if (note?.trim()) await addSubscriptionNote(sub.id, `Stopped renewing: ${note.trim()}`, actor);
  await cancelOpenRenewals(sub.id, actor.by, 'The plan was set not to renew');
  const fresh = (await getSubscriptionById(sub.id)) as Subscription;
  await mailCustomer(fresh, 'subscription.stopped');
  if (!actor.isStaff) await alertOwner(fresh, `${customerNameOf(fresh)} stopped renewing ${fresh.title}. It ends on ${longDate(fresh.currentPeriodEnd)}.`, settings);
  if (actor.staffId) await writeAudit({ userId: actor.staffId, action: 'subscription.stop_renewing', entity: 'subscription', entityId: sub.id });
}

/** Changed their mind: the plan renews as before. */
export async function resumeRenewing(sub: Subscription, actor: Actor): Promise<void> {
  if (sub.status !== 'ACTIVE' || !sub.cancelAtPeriodEnd) throw new HttpError(409, 'This plan is not set to stop.');
  const db = getDb();
  await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false, cancelledAt: null } });
  await addHistory(db, sub.id, { by: actor.by, from: sub.status, to: sub.status, note: 'Renewing again' });
  if (actor.staffId) await writeAudit({ userId: actor.staffId, action: 'subscription.resume_renewing', entity: 'subscription', entityId: sub.id });
}

/**
 * Pay now, or start again. Returns the order the customer pays. For an active plan it is only offered once the
 * renewal window has opened, so nobody pays months ahead by accident.
 */
export async function renewNow(sub: Subscription, actor: Actor): Promise<PaidOrder> {
  const settings = await getSetting(subscriptionSettings);
  const ended = sub.status === 'EXPIRED' || sub.status === 'CANCELLED';
  if (ended && !actor.isStaff && !settings.customerCanRestart) throw new HttpError(403, 'Please contact us to start this plan again.');
  if (sub.status === 'ACTIVE') {
    if (sub.cancelAtPeriodEnd) throw new HttpError(409, 'This plan is set not to renew. Choose "Keep renewing" first.');
    if (!actor.isStaff && daysUntil(sub.currentPeriodEnd, new Date()) > settings.leadDays) throw new HttpError(409, `You can renew ${plural(settings.leadDays, 'day')} before the plan ends. We will email you the invoice then.`);
  }
  const { order } = await createRenewalOrder(sub.id, actor.by);
  if (actor.staffId) await writeAudit({ userId: actor.staffId, action: 'subscription.renewal_invoice', entity: 'subscription', entityId: sub.id });
  return order;
}

/** Staff: send the renewal invoice now and email it. */
export async function sendRenewalInvoice(subscriptionId: string, actor: Actor): Promise<string> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub) throw new HttpError(404, 'This subscription no longer exists.');
  if (sub.status === 'ACTIVE' && sub.cancelAtPeriodEnd) throw new HttpError(409, 'This plan is set not to renew. Turn renewing back on first.');
  const order = await renewNow(sub, actor);
  const ended = sub.status === 'EXPIRED' || sub.status === 'CANCELLED';
  const ok = await emailRenewal(sub, order, ended ? 'subscription.past_due' : 'subscription.renewal_due', { message: ended ? 'Your plan has ended. Pay this invoice to start it again.' : '' });
  return ok ? `Invoice ${order.number} is ready and was emailed to ${sub.email}.` : `Invoice ${order.number} is ready, but the email could not be sent. Check the mail settings.`;
}

/** Staff: give free days. Also brings an ended plan back. */
export async function grantDays(subscriptionId: string, days: number, actor: Actor, note?: string): Promise<Subscription> {
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new HttpError(422, 'Enter a number of days between 1 and 3650.');
  const db = getDb();
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new HttpError(404, 'This subscription no longer exists.');
  const ended = sub.status === 'EXPIRED' || sub.status === 'CANCELLED';
  const now = new Date();
  const start = ended || sub.currentPeriodEnd.getTime() < now.getTime() ? now : sub.currentPeriodEnd;
  const end = addDays(start, days);
  const updated = await db.$transaction(async (tx) => {
    await tx.subscriptionTerm.create({ data: { subscriptionId: sub.id, kind: 'grant', periodStart: start, periodEnd: end, amount: 0 } });
    const row = await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, cancelledAt: null, endedAt: null, remindersSent: [] } });
    await addHistory(tx, sub.id, { by: actor.by, from: sub.status, to: 'ACTIVE', note: `${plural(days, 'free day')} added. Now runs until ${longDate(end)}.` });
    return row;
  });
  // The history is visible to the customer; what staff write about it stays private.
  if (note?.trim()) await addSubscriptionNote(sub.id, `Free days (${days}): ${note.trim()}`, actor);
  // The old renewal invoice was for the old end date.
  await cancelOpenRenewals(sub.id, actor.by, 'The end date was changed');
  if (actor.staffId) await writeAudit({ userId: actor.staffId, action: 'subscription.grant_days', entity: 'subscription', entityId: sub.id, diff: { days } });
  return updated;
}

/** Staff: end the plan now. */
export async function cancelNow(subscriptionId: string, actor: Actor, note?: string, notify = true): Promise<void> {
  const db = getDb();
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new HttpError(404, 'This subscription no longer exists.');
  if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') throw new HttpError(409, 'This plan has already ended.');
  const now = new Date();
  await db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', endedAt: now, cancelledAt: sub.cancelledAt ?? now, cancelAtPeriodEnd: false } });
  await addHistory(db, sub.id, { by: actor.by, from: sub.status, to: 'CANCELLED', note: 'The plan was ended' });
  if (note?.trim()) await addSubscriptionNote(sub.id, `Ended now: ${note.trim()}`, actor);
  await cancelOpenRenewals(sub.id, actor.by, 'The plan was cancelled');
  if (notify) await mailCustomer((await getSubscriptionById(sub.id)) as Subscription, 'subscription.ended', { ends: longDate(now), message: note ?? '' });
  if (actor.staffId) await writeAudit({ userId: actor.staffId, action: 'subscription.cancel', entity: 'subscription', entityId: sub.id });
}

export async function addSubscriptionNote(subscriptionId: string, text: string, actor: Actor): Promise<void> {
  const db = getDb();
  const row = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { notes: true } });
  if (!row) throw new HttpError(404, 'This subscription no longer exists.');
  await db.subscription.update({ where: { id: subscriptionId }, data: { notes: [...arr(row.notes), { at: nowIso(), by: actor.by, text: text.slice(0, 2000) }] as Json } });
}

export interface ManualInput {
  packageId?: string | null;
  title?: string;
  period: string;
  /** Minor units; empty uses the package price. */
  amount?: number | null;
  currency?: string;
  name: string;
  email: string;
  phone?: string;
  startsAt?: Date;
  /** The first term was paid outside the site, so it starts running now. */
  notify?: boolean;
}

/** Staff: add a subscriber who pays outside the site (cash, an old invoice, a deal). The first term is recorded as paid. */
export async function createManualSubscription(input: ManualInput, actor: Actor): Promise<Subscription> {
  const db = getDb();
  if (!isSubPeriod(input.period)) throw new HttpError(422, 'Choose monthly or yearly.', 'period');
  const period = input.period;
  const settings = await getSetting(subscriptionSettings);
  const pay = await getSetting(paymentSettings);
  const pkg = input.packageId ? await db.package.findUnique({ where: { id: input.packageId }, include: { service: true } }) : null;
  if (input.packageId && !pkg) throw new HttpError(422, 'Choose a package from the list.', 'packageId');

  let amount = input.amount ?? null;
  if (amount === null || amount === undefined) {
    if (!pkg) throw new HttpError(422, 'Enter the price of one term.', 'amount');
    try {
      amount = quoteFor(pkg as PackagePricing, period).unit;
    } catch (error) {
      throw new HttpError(422, error instanceof Error ? error.message : 'This package cannot be billed that way.', 'period');
    }
  }
  if (!Number.isInteger(amount) || amount < 0) throw new HttpError(422, 'Enter a price of 0 or more.', 'amount');
  const title = (input.title?.trim() || (pkg ? `${pkg.service.name}: ${pkg.name}` : '')).slice(0, 160);
  if (!title) throw new HttpError(422, 'Give the plan a name or choose a package.', 'title');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'Enter a valid email address.', 'email');
  if (!input.name.trim()) throw new HttpError(422, 'Enter the customer’s name.', 'name');

  const start = input.startsAt ?? new Date();
  const anchorDay = start.getUTCDate();
  const end = addMonths(start, monthsIn(period), anchorDay);
  const currency = (input.currency || pkg?.currency || pay.currency).toUpperCase();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const sub = await db.$transaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            number: subscriptionNumber(settings.numberPrefix),
            token: randomBytes(32).toString('base64url'),
            email,
            customer: { name: input.name.trim(), phone: input.phone?.trim() ?? '' } as Json,
            packageId: pkg?.id ?? null,
            title,
            period,
            currency,
            amount: amount as number,
            anchorDay,
            startedAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            status: end.getTime() > Date.now() ? 'ACTIVE' : 'PAST_DUE',
            snapshot: { package: pkg ? { id: pkg.id, name: pkg.name, billing: pkg.billing } : null, service: pkg ? { name: pkg.service.name } : null, period, manual: true } as Json,
            history: [{ at: nowIso(), by: actor.by, from: null, to: 'ACTIVE', note: 'Added by staff' }] as Json,
          },
        });
        await tx.subscriptionTerm.create({ data: { subscriptionId: created.id, kind: 'manual', periodStart: start, periodEnd: end, amount: amount as number } });
        return created;
      });
      if (input.notify) await mailCustomer(sub, 'subscription.started');
      if (actor.staffId) await writeAudit({ userId: actor.staffId, action: 'subscription.create', entity: 'subscription', entityId: sub.id });
      return sub;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  throw new HttpError(500, 'Could not create a subscription number. Please try again.');
}

// ---------- refunds ----------

/**
 * Order-refunded handler. A full refund of the order that paid the current term ends the plan (if the owner
 * allows it); any other refund only leaves a note, because shortening an older term would be a guess.
 */
export async function handleRefundedOrder(order: PaidOrder): Promise<void> {
  const db = getDb();
  const term = await db.subscriptionTerm.findUnique({ where: { orderId: order.id }, include: { subscription: { include: { terms: { orderBy: { periodEnd: 'desc' }, take: 1 } } } } });
  if (!term) return;
  const sub = term.subscription;
  const settings = await getSetting(subscriptionSettings);
  const latest = sub.terms[0]?.id === term.id;
  if (latest && settings.refundEndsPlan && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE')) {
    const now = new Date();
    await db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', endedAt: now, cancelledAt: now, cancelAtPeriodEnd: false } });
    await addHistory(db, sub.id, { by: 'system', from: sub.status, to: 'CANCELLED', note: `Order ${order.number} was refunded in full, so the plan was ended.` });
    await cancelOpenRenewals(sub.id, 'system', 'The plan was ended after a refund');
    await alertOwner((await getSubscriptionById(sub.id)) as Subscription, `Order ${order.number} was refunded in full, so ${sub.title} for ${customerNameOf(sub)} was ended.`, settings);
  } else {
    await addHistory(db, sub.id, { by: 'system', from: sub.status, to: sub.status, note: `Order ${order.number} was refunded in full. Check whether this plan should end.` });
  }
}
