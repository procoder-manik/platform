/**
 * The subscription engine against a real database: starting from a paid order, renewal invoices, reminders,
 * grace and expiry, paying late, stopping, free days, refunds and staff-added plans. Runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { saveSetting } from '@/lib/settings/store';
import { saveModuleChoices } from '@/lib/modules/server';
import { paymentSettings } from '@/lib/checkout/settings';
import { getOrderById, markOrderPaid, placeServiceOrder, recordRefund, type FullOrder } from '@/lib/checkout/orders';
import { cancelNow, createManualSubscription, createRenewalOrder, grantDays, handlePaidOrder, renewNow, resumeRenewing, runCycle, stopRenewing, type Actor } from '@/lib/subscriptions/engine';
import { subscriptionSettings } from '@/lib/subscriptions/settings';
import { addDays, addMonths } from '@/lib/subscriptions/schedule';
import { HttpError } from '@/lib/http/errors';

const run = Boolean(process.env.DATABASE_URL);
const tag = `s${Date.now().toString(36)}`;
const slug = (s: string) => `${tag}-${s}`;
const email = (s: string) => `${tag}.${s}@subs.test`;
const staff: Actor = { by: 'Tester', isStaff: true };
const customer: Actor = { by: 'customer', isStaff: false };
let staffId = '';
const previous: Record<string, unknown> = {};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fresh = async (id: string) => getDb().subscription.findUniqueOrThrow({ where: { id }, include: { terms: { orderBy: { periodEnd: 'asc' } } } });
const refuses = async (p: Promise<unknown>, text: RegExp) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, 'should have been refused').toBeInstanceOf(HttpError);
  expect((e as HttpError).message).toMatch(text);
};

/** Buys a package and pays it, which starts the subscription. */
async function subscribe(name: string, packageSlug = slug('monthly'), period = 'monthly') {
  const order = await placeServiceOrder({ packageSlug, period, name: 'Sam', email: email(name), phone: '0170', requirements: {}, methodId: 'bkash' });
  expect(await markOrderPaid(order.id, 'test')).toBe(true);
  const paid = (await getOrderById(order.id)) as FullOrder;
  const sub = await getDb().subscription.findFirstOrThrow({ where: { email: email(name) }, orderBy: { createdAt: 'desc' } });
  return { order: paid, sub: await fresh(sub.id) };
}

/** Moves a plan's term so tests can reach any day of its life without waiting. */
async function setEnd(id: string, end: Date, status?: 'ACTIVE' | 'PAST_DUE') {
  await getDb().subscription.update({ where: { id }, data: { currentPeriodEnd: end, currentPeriodStart: addMonths(end, -1), ...(status ? { status } : {}) } });
}

describe.skipIf(!run)('subscriptions (database)', () => {
  beforeAll(async () => {
    const db = getDb();
    staffId = (await db.user.create({ data: { email: `${tag}.staff@subs.test`, kind: 'STAFF', role: 'administrator', name: 'Tester' } })).id;
    for (const key of ['payments', 'subscriptions', 'modules']) previous[key] = (await db.setting.findUnique({ where: { key } }))?.data ?? null;
    await saveSetting(paymentSettings, {
      currency: 'USD', localCurrency: '', localRate: null, orderPrefix: 'TS', invoicePrefix: 'TSI', taxRatePct: 10, taxInclusive: false, ownerEmail: 'owner@subs.test',
      methods: [{ id: 'bkash', enabled: true, label: 'bKash', details: 'Number 01700000000', testMode: true }],
    });
    await saveSetting(subscriptionSettings, { ...subscriptionSettings.defaults, numberPrefix: 'TSS' });
    await saveModuleChoices({ services: true, checkout: true, subscriptions: true });
    const service = await db.service.create({ data: { name: 'Care', slug: slug('svc'), active: true } });
    const base = { serviceId: service.id, currency: 'USD', features: [] as string[] };
    await db.package.createMany({
      data: [
        { ...base, name: 'Monthly', slug: slug('monthly'), price: 5000, billing: 'MONTHLY', monthlyYearly: true, yearlyDiscountPct: 20 },
        { ...base, name: 'Once', slug: slug('once'), price: 9000 },
      ],
    });
  });

  afterAll(async () => {
    const db = getDb();
    await db.order.deleteMany({ where: { email: { endsWith: '@subs.test' } } });
    await db.subscription.deleteMany({ where: { email: { endsWith: '@subs.test' } } });
    await db.auditLog.deleteMany({ where: { userId: staffId } });
    await db.user.deleteMany({ where: { email: { endsWith: '@subs.test' } } });
    await db.package.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.service.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.emailLog.deleteMany({ where: { to: { endsWith: '@subs.test' } } });
    for (const [key, data] of Object.entries(previous)) {
      if (data === null) await db.setting.deleteMany({ where: { key } });
      else await db.setting.update({ where: { key }, data: { data: data as object } });
    }
  });

  it('starts a subscription when a recurring package is paid, once', async () => {
    const { order, sub } = await subscribe('start');
    expect(sub).toMatchObject({ status: 'ACTIVE', period: 'monthly', amount: 5000, currency: 'USD', renewals: 0, cancelAtPeriodEnd: false, title: 'Care: Monthly' });
    expect(sub.number).toMatch(/^TSS-\d{6}-[A-Z0-9]{4}$/);
    expect(sub.token.length).toBeGreaterThanOrEqual(40);
    expect(sub.terms).toHaveLength(1);
    expect(sub.terms[0]).toMatchObject({ kind: 'first', orderId: order.id, amount: 5000 });
    expect(iso(sub.currentPeriodEnd)).toBe(iso(addMonths(sub.currentPeriodStart, 1, sub.anchorDay)));
    expect((await getOrderById(order.id))?.subscriptionId).toBe(sub.id);
    // A repeated paid event never starts a second plan.
    await handlePaidOrder(order);
    await handlePaidOrder(order);
    expect(await getDb().subscription.count({ where: { email: email('start') } })).toBe(1);
    expect(await getDb().emailLog.count({ where: { entity: 'subscription', entityId: sub.id, template: 'subscription.started' } })).toBe(1);
  });

  it('uses the chosen period and price: yearly is the discounted yearly price', async () => {
    const { sub } = await subscribe('yearly', slug('monthly'), 'yearly');
    expect(sub).toMatchObject({ period: 'yearly', amount: 48_000 });
    expect(iso(sub.currentPeriodEnd)).toBe(iso(addMonths(sub.currentPeriodStart, 12, sub.anchorDay)));
  });

  it('does not start a plan from a one-time package', async () => {
    const order = await placeServiceOrder({ packageSlug: slug('once'), name: 'Sam', email: email('once'), phone: '', requirements: {}, methodId: 'bkash' });
    await markOrderPaid(order.id, 'test');
    expect(await getDb().subscription.count({ where: { email: email('once') } })).toBe(0);
  });

  it('does not start new plans while the module is off, and starts them again when it is on', async () => {
    await saveModuleChoices({ services: true, checkout: true, subscriptions: false });
    const order = await placeServiceOrder({ packageSlug: slug('monthly'), name: 'Sam', email: email('off'), phone: '', requirements: {}, methodId: 'bkash' });
    await markOrderPaid(order.id, 'test');
    expect(await getDb().subscription.count({ where: { email: email('off') } })).toBe(0);
    await saveModuleChoices({ services: true, checkout: true, subscriptions: true });
  });

  it('creates one renewal invoice inside the lead time, with tax, and sends each reminder once', async () => {
    const { sub } = await subscribe('cycle');
    const now = new Date();
    await setEnd(sub.id, addDays(now, 5));

    let r = await runCycle(now);
    expect(r.failed).toBe(0);
    const orders = await getDb().order.findMany({ where: { subscriptionId: sub.id, items: { some: { kind: 'renewal' } } }, include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: 'PENDING_PAYMENT', subtotal: 5000, tax: 500, total: 5500, email: email('cycle') });
    expect(await getDb().emailLog.count({ where: { entity: 'subscription', entityId: sub.id, template: 'subscription.renewal_due' } })).toBe(1);

    r = await runCycle(now);
    expect(r).toMatchObject({ renewalsCreated: 0, reminders: 0 });
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, items: { some: { kind: 'renewal' } } } })).toBe(1);

    r = await runCycle(addDays(now, 3));
    expect(r.reminders).toBe(1);
    r = await runCycle(addDays(now, 3));
    expect(r.reminders).toBe(0);
    expect(await getDb().emailLog.count({ where: { entity: 'subscription', entityId: sub.id, template: 'subscription.reminder' } })).toBe(1);
  });

  it('paying the renewal continues from the old end date, even a little late', async () => {
    const { sub } = await subscribe('renew');
    const end = addDays(new Date(), 5);
    await setEnd(sub.id, end);
    await runCycle(new Date());
    const open = await getDb().order.findFirstOrThrow({ where: { subscriptionId: sub.id, items: { some: { kind: 'renewal' } } } });
    expect(await markOrderPaid(open.id, 'test')).toBe(true);
    const after = await fresh(sub.id);
    expect(after).toMatchObject({ status: 'ACTIVE', renewals: 1, cancelAtPeriodEnd: false });
    expect(after.currentPeriodStart.toISOString()).toBe(end.toISOString());
    expect(iso(after.currentPeriodEnd)).toBe(iso(addMonths(end, 1, sub.anchorDay)));
    expect(after.terms.map((t) => t.kind)).toEqual(['first', 'renewal']);
    expect(after.remindersSent).toEqual([]);
    // Paying the same order again changes nothing.
    expect(await markOrderPaid(open.id, 'test')).toBe(false);
    expect((await fresh(sub.id)).renewals).toBe(1);
  });

  it('keeps the plan through the grace period, then expires it and cancels the unpaid invoice', async () => {
    const { sub } = await subscribe('grace');
    const end = addDays(new Date(), -1);
    await setEnd(sub.id, end);
    let r = await runCycle(new Date());
    expect(r.pastDue).toBe(1);
    expect((await fresh(sub.id)).status).toBe('PAST_DUE');
    expect(await getDb().emailLog.count({ where: { entity: 'subscription', entityId: sub.id, template: 'subscription.past_due' } })).toBe(1);
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT', items: { some: { kind: 'renewal' } } } })).toBe(1);

    r = await runCycle(addDays(end, 1));
    expect(r).toMatchObject({ expired: 0, pastDue: 0 });

    r = await runCycle(addDays(end, 4));
    expect(r.expired).toBe(1);
    const after = await fresh(sub.id);
    expect(after.status).toBe('EXPIRED');
    expect(after.endedAt).not.toBeNull();
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT', items: { some: { kind: 'renewal' } } } })).toBe(0);
  });

  it('paying inside the grace period loses no days', async () => {
    const { sub } = await subscribe('late');
    const end = addDays(new Date(), -1);
    await setEnd(sub.id, end);
    await runCycle(new Date());
    const open = await getDb().order.findFirstOrThrow({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT' } });
    await markOrderPaid(open.id, 'test');
    const after = await fresh(sub.id);
    expect(after.status).toBe('ACTIVE');
    expect(after.currentPeriodStart.toISOString()).toBe(end.toISOString());
  });

  it('starts again from today when the customer pays after the plan expired', async () => {
    const { sub } = await subscribe('restart');
    await setEnd(sub.id, addDays(new Date(), -10), 'PAST_DUE');
    await runCycle(new Date());
    expect((await fresh(sub.id)).status).toBe('EXPIRED');
    const order = await renewNow(await fresh(sub.id), customer);
    expect(order.items[0]).toMatchObject({ kind: 'renewal', unitPrice: 5000 });
    expect((order.items[0]?.snapshot as { restart: boolean }).restart).toBe(true);
    await markOrderPaid(order.id, 'test');
    const after = await fresh(sub.id);
    const today = new Date();
    expect(after).toMatchObject({ status: 'ACTIVE', endedAt: null, anchorDay: today.getUTCDate() });
    expect(iso(after.currentPeriodStart)).toBe(iso(today));
    expect(iso(after.currentPeriodEnd)).toBe(iso(addMonths(today, 1, today.getUTCDate())));
    expect(after.terms.map((t) => t.kind)).toEqual(['first', 'restart']);
    expect(after.renewals).toBe(0);
  });

  it('a plan set not to renew gets no invoice and ends on its end date', async () => {
    const { sub } = await subscribe('stop');
    await refuses(resumeRenewing(sub, customer), /not set to stop/);
    await setEnd(sub.id, addDays(new Date(), 5));
    await runCycle(new Date());
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT', items: { some: { kind: 'renewal' } } } })).toBe(1);

    await stopRenewing(await fresh(sub.id), customer);
    expect((await fresh(sub.id)).cancelAtPeriodEnd).toBe(true);
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT', items: { some: { kind: 'renewal' } } } })).toBe(0);
    await refuses(renewNow(await fresh(sub.id), customer), /not to renew/);

    // The job also looks at every other plan in the database, so check this plan's own state.
    await runCycle(addDays(new Date(), 4));
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT', items: { some: { kind: 'renewal' } } } })).toBe(0);
    expect(await getDb().emailLog.count({ where: { entity: 'subscription', entityId: sub.id, template: 'subscription.reminder' } })).toBe(0);
    expect((await fresh(sub.id)).status).toBe('ACTIVE');
    const end = (await fresh(sub.id)).currentPeriodEnd;
    await runCycle(addDays(end, 1));
    expect(await fresh(sub.id)).toMatchObject({ status: 'CANCELLED' });
    expect(await getDb().emailLog.count({ where: { entity: 'subscription', entityId: sub.id, template: 'subscription.ended' } })).toBe(1);
  });

  it('lets the customer change their mind before the end', async () => {
    const { sub } = await subscribe('resume');
    await stopRenewing(sub, customer);
    await resumeRenewing(await fresh(sub.id), customer);
    expect((await fresh(sub.id)).cancelAtPeriodEnd).toBe(false);
  });

  it('only offers early renewal inside the lead time to customers', async () => {
    const { sub } = await subscribe('early');
    await refuses(renewNow(sub, customer), /before the plan ends/);
    const order = await renewNow(sub, staff);
    expect(order.status).toBe('PENDING_PAYMENT');
    // Asking twice gives the same invoice.
    expect((await renewNow(await fresh(sub.id), staff)).id).toBe(order.id);
  });

  it('adds free days, cancels the stale invoice and can bring an ended plan back', async () => {
    const { sub } = await subscribe('grant');
    await createRenewalOrder(sub.id, 'test');
    const before = (await fresh(sub.id)).currentPeriodEnd;
    const after = await grantDays(sub.id, 10, staff, 'goodwill');
    expect(iso(after.currentPeriodEnd)).toBe(iso(addDays(before, 10)));
    expect(await getDb().order.count({ where: { subscriptionId: sub.id, status: 'PENDING_PAYMENT', items: { some: { kind: 'renewal' } } } })).toBe(0);
    expect((await fresh(sub.id)).terms.at(-1)).toMatchObject({ kind: 'grant', amount: 0 });
    // The staff note stays private.
    const row = await fresh(sub.id);
    expect(JSON.stringify(row.history)).not.toContain('goodwill');
    expect(JSON.stringify(row.notes)).toContain('goodwill');
    await refuses(grantDays(sub.id, 0, staff), /between 1 and 3650/);

    await cancelNow(sub.id, staff, 'closing the account', false);
    expect((await fresh(sub.id)).status).toBe('CANCELLED');
    await refuses(cancelNow(sub.id, staff), /already ended/);
    const back = await grantDays(sub.id, 30, staff);
    expect(back.status).toBe('ACTIVE');
    expect(iso(back.currentPeriodEnd)).toBe(iso(addDays(new Date(), 30)));
  });

  it('renews at the locked price by default and at the package price when the owner chooses', async () => {
    const { sub } = await subscribe('price');
    await getDb().package.update({ where: { slug: slug('monthly') }, data: { price: 7000 } });
    const locked = await createRenewalOrder(sub.id, 'test');
    expect(locked.order.items[0]?.unitPrice).toBe(5000);
    await getDb().order.update({ where: { id: locked.order.id }, data: { status: 'CANCELLED' } });

    await saveSetting(subscriptionSettings, { ...subscriptionSettings.defaults, numberPrefix: 'TSS', renewalPrice: 'current' });
    const current = await createRenewalOrder(sub.id, 'test');
    expect(current.order.items[0]?.unitPrice).toBe(7000);
    expect(current.order.total).toBe(7700);
    await saveSetting(subscriptionSettings, { ...subscriptionSettings.defaults, numberPrefix: 'TSS' });
    await getDb().package.update({ where: { slug: slug('monthly') }, data: { price: 5000 } });
  });

  it('ends the plan after a full refund of the latest term, but only leaves a note for an older one', async () => {
    const { order, sub } = await subscribe('refund');
    await recordRefund(order.id, order.total, { id: staffId, name: 'Tester' });
    expect((await fresh(sub.id)).status).toBe('CANCELLED');

    const second = await subscribe('refund2');
    await setEnd(second.sub.id, addDays(new Date(), 3));
    await runCycle(new Date());
    const renewal = await getDb().order.findFirstOrThrow({ where: { subscriptionId: second.sub.id, status: 'PENDING_PAYMENT' } });
    await markOrderPaid(renewal.id, 'test');
    await recordRefund(second.order.id, second.order.total, { id: staffId, name: 'Tester' });
    const kept = await fresh(second.sub.id);
    expect(kept.status).toBe('ACTIVE');
    expect(JSON.stringify(kept.history)).toContain('Check whether this plan should end');
  });

  it('adds a plan for a customer who pays outside the site, and checks its input', async () => {
    const sub = await createManualSubscription({ packageId: null, title: 'Care plan', period: 'monthly', amount: 4000, name: 'Ana', email: email('manual'), startsAt: addDays(new Date(), -10) }, staff);
    expect(sub).toMatchObject({ status: 'ACTIVE', amount: 4000, title: 'Care plan', currency: 'USD' });
    expect((await fresh(sub.id)).terms[0]).toMatchObject({ kind: 'manual', orderId: null });
    await refuses(createManualSubscription({ title: 'x', period: 'weekly', amount: 1, name: 'A', email: email('m2') }, staff), /monthly or yearly/);
    await refuses(createManualSubscription({ title: '', period: 'monthly', amount: 1, name: 'A', email: email('m3') }, staff), /name or choose a package/);
    await refuses(createManualSubscription({ title: 'x', period: 'monthly', amount: null, name: 'A', email: email('m4') }, staff), /price/);
    await refuses(createManualSubscription({ title: 'x', period: 'monthly', amount: 1, name: 'A', email: 'nope' }, staff), /valid email/);
    const pkg = await getDb().package.findUniqueOrThrow({ where: { slug: slug('monthly') } });
    const fromPackage = await createManualSubscription({ packageId: pkg.id, period: 'yearly', name: 'Ben', email: email('m5') }, staff);
    expect(fromPackage).toMatchObject({ amount: 48_000, period: 'yearly', title: 'Care: Monthly' });
  });
});
