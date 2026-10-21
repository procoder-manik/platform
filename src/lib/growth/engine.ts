import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { HttpError } from '@/lib/http/errors';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/settings/store';
import { ownerEmail, sendTemplate } from '@/lib/mail/send';
import { baseUrl } from '@/lib/url';
import { formatMinor } from '@/lib/checkout/money';
import { paymentSettings } from '@/lib/checkout/settings';
import { PAID_STATES } from '@/lib/checkout/status';
import { runCancelHandlers, type PaidOrder } from '@/lib/checkout/events';
import { addDays, commissionFor, couponDiscount, couponProblem, normalizeCode, randomCode } from './logic';
import { affiliateSettings, referralSettings } from './settings';

type Json = Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;
type Entry = Record<string, unknown>;

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const arr = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);
const nowIso = () => new Date().toISOString();
const longDate = (d: Date) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

/** Unpaid orders that carry a discount are cancelled after this long, so abandoned carts cannot use up a limited code. */
export const DISCOUNT_HOLD_HOURS = 72;

// ---------- discounts at checkout ----------

export interface DiscountContext {
  email: string;
  scope: 'services' | 'products';
  currency: string;
  /** Products or services before discount, without shipping or tax. */
  subtotal: number;
}

export type DiscountSource = { kind: 'coupon'; couponId: string; code: string } | { kind: 'referral'; codeId: string; code: string; referrerEmail: string };

export type DiscountResult =
  | { ok: true; source: DiscountSource; discount: number; freeShipping: boolean; label: string }
  | { ok: false; message: string };

const hasPaidOrder = async (email: string) => (await getDb().order.count({ where: { email: email.toLowerCase(), status: { in: [...PAID_STATES] } } })) > 0;

/**
 * Works out what a code is worth for this order, or why it cannot be used. A code can be a coupon or, when
 * Referrals is on, a customer's own code. Pure reading: nothing is counted until the order is placed.
 */
export async function resolveDiscount(raw: unknown, ctx: DiscountContext): Promise<DiscountResult> {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, message: 'That code is not valid. Check it and try again.' };
  const db = getDb();
  const email = ctx.email.trim().toLowerCase();
  const pay = await getSetting(paymentSettings);
  const fmt = (n: number) => formatMinor(n, ctx.currency);

  if (await isOn('coupons')) {
    const coupon = await db.coupon.findUnique({ where: { code } });
    if (coupon) {
      if (coupon.kind === 'fixed' && ctx.currency.toUpperCase() !== pay.currency.toUpperCase()) return { ok: false, message: 'This code cannot be used with this currency.' };
      const [usedByEmail, hasPriorOrder] = email ? await Promise.all([db.couponRedemption.count({ where: { couponId: coupon.id, email } }), coupon.firstOrderOnly ? hasPaidOrder(email) : Promise.resolve(false)]) : [0, false];
      const problem = couponProblem(coupon, { email, scope: ctx.scope, subtotal: ctx.subtotal, now: new Date(), usedByEmail, hasPriorOrder });
      if (problem) return { ok: false, message: problem };
      const { discount, freeShipping } = couponDiscount(coupon, ctx.subtotal);
      if (discount <= 0 && !freeShipping) return { ok: false, message: 'This code takes nothing off this order.' };
      return { ok: true, source: { kind: 'coupon', couponId: coupon.id, code }, discount, freeShipping, label: freeShipping ? 'Free shipping' : `Code ${code}: ${fmt(discount)} off` };
    }
  }

  if (await isOn('referrals')) {
    const ref = await db.referralCode.findUnique({ where: { code } });
    if (ref) {
      const s = await getSetting(referralSettings);
      if (!email) return { ok: false, message: 'Enter your email address first, so we can check this code.' };
      if (ref.email === email) return { ok: false, message: 'You cannot use your own referral code.' };
      if (s.friendKind === 'fixed' && ctx.currency.toUpperCase() !== pay.currency.toUpperCase()) return { ok: false, message: 'This code cannot be used with this currency.' };
      if (await hasPaidOrder(email)) return { ok: false, message: 'Referral codes are for a first order. You have ordered here before.' };
      const earlier = await db.referral.count({ where: { friendEmail: email, status: { not: 'void' } } });
      if (earlier > 0) return { ok: false, message: 'A referral code was already used with this email address.' };
      if (s.minSubtotal && ctx.subtotal < s.minSubtotal) return { ok: false, message: `Referral codes need an order of at least ${fmt(s.minSubtotal)}.` };
      const { discount } = couponDiscount({ kind: s.friendKind, percent: s.friendPercent, amount: s.friendAmount, maxDiscount: null }, ctx.subtotal);
      if (discount <= 0) return { ok: false, message: 'This code takes nothing off this order.' };
      return { ok: true, source: { kind: 'referral', codeId: ref.id, code, referrerEmail: ref.email }, discount, freeShipping: false, label: `Referral code ${code}: ${fmt(discount)} off` };
    }
  }
  return { ok: false, message: 'That code is not valid. Check it and try again.' };
}

/**
 * Counts the discount for an order, inside the order's own transaction. A coupon's limit is checked and
 * raised in one statement, so a code with one use left can never go to two orders.
 */
export async function recordDiscount(tx: Tx, source: DiscountSource, order: { id: string; email: string }, amount: number): Promise<void> {
  const email = order.email.toLowerCase();
  if (source.kind === 'coupon') {
    const rows = await tx.$queryRaw<{ id: string }[]>`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = now() WHERE id = ${source.couponId} AND active = true AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit") RETURNING id`;
    if (rows.length === 0) throw new HttpError(409, 'This code has just been used up.', 'code');
    const coupon = await tx.coupon.findUnique({ where: { id: source.couponId }, select: { perCustomerLimit: true } });
    if (coupon?.perCustomerLimit != null) {
      const used = await tx.couponRedemption.count({ where: { couponId: source.couponId, email } });
      if (used >= coupon.perCustomerLimit) throw new HttpError(409, 'You have already used this code.', 'code');
    }
    await tx.couponRedemption.create({ data: { couponId: source.couponId, code: source.code, orderId: order.id, email, amount } });
    return;
  }
  const clash = await tx.referral.count({ where: { friendEmail: email, status: { not: 'void' } } });
  if (clash > 0) throw new HttpError(409, 'A referral code was already used with this email address.', 'code');
  await tx.referral.create({ data: { codeId: source.codeId, code: source.code, referrerEmail: source.referrerEmail, friendEmail: email, orderId: order.id, discount: amount } });
}

/** Gives a cancelled order's code back: the use is uncounted and a pending referral is voided. Safe to call twice. */
export async function releaseDiscount(orderId: string): Promise<boolean> {
  const db = getDb();
  let released = false;
  const redemption = await db.couponRedemption.findUnique({ where: { orderId } });
  if (redemption) {
    await db.$transaction(async (tx) => {
      const gone = await tx.couponRedemption.deleteMany({ where: { orderId } });
      if (gone.count) await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now() WHERE id = ${redemption.couponId}`;
    });
    released = true;
  }
  const voided = await db.referral.updateMany({ where: { orderId, status: 'pending' }, data: { status: 'void', note: 'The order was cancelled' } });
  return released || voided.count > 0;
}

// ---------- affiliate attribution ----------

/** The affiliate an order should be credited to, from the link cookie. Null when the code is unknown, paused or the buyer's own. */
export async function attributeAffiliate(code: unknown, buyerEmail: string): Promise<string | null> {
  const clean = normalizeCode(code);
  if (!clean || !(await isOn('affiliates'))) return null;
  const a = await getDb().affiliate.findUnique({ where: { code: clean }, select: { id: true, status: true, email: true } });
  if (!a || a.status !== 'active' || a.email === buyerEmail.trim().toLowerCase()) return null;
  return a.id;
}

/** A click on an affiliate or referral link. Returns whether the code exists. */
export async function trackClick(kind: 'affiliate' | 'referral', rawCode: string): Promise<boolean> {
  const code = normalizeCode(rawCode);
  if (!code) return false;
  const db = getDb();
  if (kind === 'affiliate') {
    if (!(await isOn('affiliates'))) return false;
    const changed = await db.affiliate.updateMany({ where: { code, status: 'active' }, data: { clicks: { increment: 1 } } });
    return changed.count > 0;
  }
  if (!(await isOn('referrals'))) return false;
  const changed = await db.referralCode.updateMany({ where: { code }, data: { clicks: { increment: 1 } } });
  return changed.count > 0;
}

// ---------- paid, refunded and cancelled orders ----------

/** Paid-order handler: commission for the affiliate, the referrer's reward, and the buyer's own code. */
export async function handlePaidGrowth(order: PaidOrder): Promise<void> {
  if (order.affiliateId && (await isOn('affiliates'))) await createCommission(order);
  if (await isOn('referrals')) {
    await rewardReferral(order);
    await inviteBuyer(order);
  }
}

async function createCommission(order: PaidOrder): Promise<void> {
  const db = getDb();
  const [settings, affiliate] = await Promise.all([getSetting(affiliateSettings), db.affiliate.findUnique({ where: { id: order.affiliateId as string } })]);
  if (!affiliate || affiliate.status !== 'active' || affiliate.email === order.email.toLowerCase()) return;
  const base = order.subtotal - order.discount;
  const rate = affiliate.commissionPct ?? settings.defaultPct;
  const amount = commissionFor(base, rate);
  if (amount <= 0) return;
  try {
    await db.commission.create({ data: { affiliateId: affiliate.id, orderId: order.id, orderNumber: order.number, base, rate, amount, currency: order.currency, status: settings.holdDays > 0 ? 'pending' : 'approved', approveAt: addDays(order.paidAt ?? new Date(), settings.holdDays) } });
  } catch (error) {
    if (!isUnique(error)) throw error;
  }
}

async function rewardReferral(order: PaidOrder): Promise<void> {
  const db = getDb();
  const referral = await db.referral.findUnique({ where: { orderId: order.id } });
  if (!referral || referral.status !== 'pending') return;
  const s = await getSetting(referralSettings);
  const claimed = await db.referral.updateMany({ where: { id: referral.id, status: 'pending' }, data: { status: 'rewarded', rewardedAt: new Date() } });
  if (!claimed.count) return;
  if (!s.rewardAmount || s.rewardAmount <= 0) return;
  const ends = addDays(new Date(), s.rewardValidDays);
  let coupon = null;
  for (let attempt = 0; attempt < 6 && !coupon; attempt += 1) {
    try {
      coupon = await db.coupon.create({ data: { code: randomCode('REWARD-'), description: `Reward for referring ${order.email}`, kind: 'fixed', amount: s.rewardAmount, scope: 'all', usageLimit: 1, perCustomerLimit: 1, endsAt: ends, origin: 'referral', ownerEmail: referral.referrerEmail } });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  if (!coupon) throw new Error('Could not make a reward code');
  await db.referral.update({ where: { id: referral.id }, data: { rewardCouponId: coupon.id } });
  const pay = await getSetting(paymentSettings);
  const base = await baseUrl();
  const rewardTo = referral.referrerEmail;
  const name = (await db.referralCode.findUnique({ where: { id: referral.codeId }, select: { name: true } }))?.name || 'there';
  await sendTemplate('referral.reward', rewardTo, { name, code: coupon.code, amount: formatMinor(s.rewardAmount, pay.currency), ends: longDate(ends), link: `${base}/shop` }, { entity: 'referral', entityId: referral.id });
}

async function inviteBuyer(order: PaidOrder): Promise<void> {
  const s = await getSetting(referralSettings);
  const db = getDb();
  const email = order.email.toLowerCase();
  if (await db.referralCode.findUnique({ where: { email }, select: { id: true } })) return;
  const name = String((order.customer as Entry | null)?.name ?? '');
  let created = null;
  for (let attempt = 0; attempt < 6 && !created; attempt += 1) {
    try {
      created = await db.referralCode.create({ data: { code: randomCode(s.codePrefix ? `${s.codePrefix}-` : ''), email, name: name || null } });
    } catch (error) {
      if (isUnique(error)) {
        if (await db.referralCode.findUnique({ where: { email }, select: { id: true } })) return;
        continue;
      }
      throw error;
    }
  }
  if (!created || !s.inviteAfterPaid) return;
  const base = await baseUrl();
  const friend = await friendOffer();
  await sendTemplate('referral.invite', email, { name: name || 'there', code: created.code, amount: friend, link: `${base}/ref/${created.code}` }, { entity: 'referral', entityId: created.id });
}

/** "10% off" or "$5.00 off", for emails and pages. */
export async function friendOffer(): Promise<string> {
  const [s, pay] = await Promise.all([getSetting(referralSettings), getSetting(paymentSettings)]);
  return s.friendKind === 'percent' ? `${s.friendPercent}% off` : `${formatMinor(s.friendAmount ?? 0, pay.currency)} off`;
}

/** Full refund: the commission is cancelled (or noted, if already paid out) and the referral reward is taken back if unused. */
export async function handleRefundedGrowth(order: PaidOrder): Promise<void> {
  const db = getDb();
  const commission = await db.commission.findUnique({ where: { orderId: order.id } });
  if (commission) {
    if (commission.status === 'pending' || commission.status === 'approved') await db.commission.update({ where: { id: commission.id }, data: { status: 'void', note: `Order ${order.number} was refunded` } });
    else if (commission.status === 'paid') await db.commission.update({ where: { id: commission.id }, data: { note: `Order ${order.number} was refunded after this was paid out. Recover it from the affiliate or take it off the next payout.` } });
  }
  const referral = await db.referral.findUnique({ where: { orderId: order.id } });
  if (referral && referral.status !== 'void') {
    let note = 'The order was refunded';
    if (referral.rewardCouponId) {
      const taken = await db.coupon.updateMany({ where: { id: referral.rewardCouponId, usedCount: 0 }, data: { active: false } });
      if (!taken.count) note = 'The order was refunded, but the reward code was already used';
    }
    await db.referral.update({ where: { id: referral.id }, data: { status: 'void', note } });
  }
}

// ---------- the daily job ----------

export interface GrowthSummary {
  approved: number;
  cancelled: number;
}

/** Makes commission ready to pay once its hold is over, and cancels unpaid orders that are holding a limited code. */
export async function runGrowthCycle(now = new Date()): Promise<GrowthSummary> {
  const db = getDb();
  const approved = await db.commission.updateMany({ where: { status: 'pending', approveAt: { lte: now } }, data: { status: 'approved' } });

  const cutoff = new Date(now.getTime() - DISCOUNT_HOLD_HOURS * 3_600_000);
  const [redemptions, referrals] = await Promise.all([
    db.couponRedemption.findMany({ where: { createdAt: { lt: cutoff } }, select: { orderId: true }, take: 200 }),
    db.referral.findMany({ where: { status: 'pending', createdAt: { lt: cutoff } }, select: { orderId: true }, take: 200 }),
  ]);
  const ids = [...new Set([...redemptions, ...referrals].map((r) => r.orderId))];
  let cancelled = 0;
  for (const id of ids) {
    const o = await db.order.findUnique({ where: { id }, include: { items: true, payments: true } });
    if (!o || !['PENDING_PAYMENT', 'FAILED'].includes(o.status)) continue;
    if (o.payments.some((p) => ['submitted', 'verified', 'paid'].includes(p.status))) continue;
    const changed = await db.order.updateMany({ where: { id, status: { in: ['PENDING_PAYMENT', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    if (!changed.count) continue;
    await db.order.update({ where: { id }, data: { history: [...arr(o.history), { at: nowIso(), by: 'system', from: o.status, to: 'CANCELLED', note: `Not paid within ${DISCOUNT_HOLD_HOURS} hours, so the discount code was given back` }] as Json } });
    await runCancelHandlers({ ...o, status: 'CANCELLED' } as PaidOrder);
    cancelled += 1;
    await sendTemplate('order.cancelled', o.email, { name: String((o.customer as Entry | null)?.name ?? 'there'), number: o.number, package: o.items.map((i) => i.title).join(', '), total: formatMinor(o.total, o.currency), link: `${await baseUrl()}/order/${o.token}` }, { entity: 'order', entityId: o.id });
  }
  return { approved: approved.count, cancelled };
}

// ---------- affiliates: applying, dashboard, payouts ----------

const CODE_SAFE = /[^A-Z0-9]/g;

async function uniqueAffiliateCode(name: string): Promise<string> {
  const base = name.toUpperCase().replace(CODE_SAFE, '').slice(0, 10) || 'PARTNER';
  const db = getDb();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = attempt === 0 && base.length >= 3 ? base : `${base.slice(0, 8)}${randomBytes(2).toString('hex').toUpperCase()}`;
    if (normalizeCode(code) && !(await db.affiliate.findUnique({ where: { code }, select: { id: true } })) && !(await db.coupon.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  return `AFF${randomBytes(4).toString('hex').toUpperCase()}`;
}

export interface ApplyInput {
  name: string;
  email: string;
  website?: string;
  payoutDetails?: string;
}

export async function applyAsAffiliate(input: ApplyInput): Promise<{ status: 'pending' | 'active'; token: string }> {
  const db = getDb();
  const settings = await getSetting(affiliateSettings);
  if (!settings.signupsOpen) throw new HttpError(403, 'We are not taking affiliate applications right now.');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'Enter a valid email address.', 'email');
  if (!input.name.trim()) throw new HttpError(422, 'Enter your name.', 'name');
  if (await db.affiliate.findUnique({ where: { email }, select: { id: true } })) throw new HttpError(409, 'This email address has already applied. Check your inbox for your dashboard link, or contact us.', 'email');
  const status = settings.autoApprove ? 'active' : 'pending';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const a = await db.affiliate.create({ data: { name: input.name.trim().slice(0, 120), email, code: await uniqueAffiliateCode(input.name), token: randomBytes(32).toString('base64url'), status, website: input.website?.trim().slice(0, 300) || null, payoutDetails: input.payoutDetails?.trim().slice(0, 600) || null } });
      await mailAffiliate(a.id, status === 'active' ? 'affiliate.welcome' : 'affiliate.received');
      if (settings.ownerAlerts) {
        const owner = await ownerEmail();
        if (owner) await sendTemplate('owner.affiliate', owner, { name: a.name, message: `${a.name} (${a.email}) applied to be an affiliate${a.website ? ` with ${a.website}` : ''}. ${status === 'active' ? 'They were approved automatically.' : 'Approve them in Marketing > Affiliates.'}`, link: `${await baseUrl()}/admin/affiliates/${a.id}` }, { entity: 'affiliate', entityId: a.id });
      }
      return { status, token: a.token };
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  throw new HttpError(500, 'Could not create your affiliate account. Please try again.');
}

export async function mailAffiliate(affiliateId: string, template: 'affiliate.welcome' | 'affiliate.received' | 'affiliate.approved' | 'affiliate.payout', extra: { amount?: string; message?: string } = {}): Promise<boolean> {
  const a = await getDb().affiliate.findUnique({ where: { id: affiliateId } });
  if (!a) return false;
  const settings = await getSetting(affiliateSettings);
  const base = await baseUrl();
  return sendTemplate(template, a.email, { name: a.name, code: a.code, amount: extra.amount ?? `${a.commissionPct ?? settings.defaultPct}%`, message: extra.message ?? '', link: `${base}/affiliate/${a.token}`, manage_link: `${base}/a/${a.code}` }, { entity: 'affiliate', entityId: a.id });
}

/** Staff: approve (or pause) an application. Approval emails the affiliate their dashboard link. */
export async function setAffiliateStatus(id: string, status: 'active' | 'paused', by: { id: string; name: string }): Promise<void> {
  const db = getDb();
  const a = await db.affiliate.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'This affiliate no longer exists.');
  if (a.status === status) return;
  await db.affiliate.update({ where: { id }, data: { status } });
  if (status === 'active' && a.status === 'pending') await mailAffiliate(id, 'affiliate.approved');
  await writeAudit({ userId: by.id, action: `affiliate.${status}`, entity: 'affiliate', entityId: id });
}

export interface Totals {
  currency: string;
  pending: number;
  approved: number;
  paid: number;
}

export async function commissionTotals(affiliateId: string): Promise<Totals[]> {
  const rows = await getDb().commission.groupBy({ by: ['currency', 'status'], where: { affiliateId, status: { not: 'void' } }, _sum: { amount: true } });
  const out = new Map<string, Totals>();
  for (const r of rows) {
    const t = out.get(r.currency) ?? { currency: r.currency, pending: 0, approved: 0, paid: 0 };
    if (r.status === 'pending' || r.status === 'approved' || r.status === 'paid') t[r.status] += r._sum.amount ?? 0;
    out.set(r.currency, t);
  }
  return [...out.values()];
}

/**
 * Staff: pay out everything that is ready for one affiliate in one currency. The commissions and the payout
 * are linked in one transaction, so nothing is paid twice.
 */
export async function recordPayout(affiliateId: string, currency: string, by: { id: string; name: string }, info: { method?: string; reference?: string; note?: string }, opts: { ignoreMinimum?: boolean } = {}) {
  const db = getDb();
  const [settings, affiliate] = await Promise.all([getSetting(affiliateSettings), db.affiliate.findUnique({ where: { id: affiliateId } })]);
  if (!affiliate) throw new HttpError(404, 'This affiliate no longer exists.');
  const payout = await db.$transaction(async (tx) => {
    const ready = await tx.commission.findMany({ where: { affiliateId, currency, status: 'approved', payoutId: null } });
    const amount = ready.reduce((n, c) => n + c.amount, 0);
    if (ready.length === 0 || amount <= 0) throw new HttpError(409, 'Nothing is ready to pay for this affiliate.');
    if (!opts.ignoreMinimum && amount < settings.minPayout) throw new HttpError(409, `Their ready commission (${formatMinor(amount, currency)}) is below the smallest payout (${formatMinor(settings.minPayout, currency)}).`);
    const created = await tx.payout.create({ data: { affiliateId, amount, currency, method: info.method?.slice(0, 60) || null, reference: info.reference?.slice(0, 120) || null, note: info.note?.slice(0, 300) || null, by: by.name } });
    const moved = await tx.commission.updateMany({ where: { id: { in: ready.map((c) => c.id) }, status: 'approved', payoutId: null }, data: { status: 'paid', payoutId: created.id } });
    if (moved.count !== ready.length) throw new HttpError(409, 'Commission changed while paying. Nothing was recorded; try again.');
    return created;
  });
  await writeAudit({ userId: by.id, action: 'affiliate.payout', entity: 'affiliate', entityId: affiliateId, diff: { amount: payout.amount, currency } });
  await mailAffiliate(affiliateId, 'affiliate.payout', { amount: formatMinor(payout.amount, currency), message: [info.method && `Method: ${info.method}`, info.reference && `Reference: ${info.reference}`].filter(Boolean).join('. ') });
  return payout;
}
