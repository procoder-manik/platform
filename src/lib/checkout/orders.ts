import 'server-only';
import { randomBytes } from 'node:crypto';
import { orderNumber } from './numbers';
import { attributeAffiliate, recordDiscount, resolveDiscount, type DiscountSource } from '@/lib/growth/engine';
import type { Order, OrderItem, Payment, Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { availableMethods, loadAdapter } from '@/lib/adapters/payments';
import type { CheckoutStart, WebhookOutcome } from '@/lib/adapters/payments/types';
import { getStorage } from '@/lib/adapters/storage';
import { writeAudit } from '@/lib/audit';
import { HttpError } from '@/lib/http/errors';
import { getSetting } from '@/lib/settings/store';
import { sendTemplate, ownerEmail } from '@/lib/mail/send';
import type { TemplateId } from '@/lib/mail/templates';
import { sniff } from '@/lib/security/file-type';
import { baseUrl } from '@/lib/url';
import { siteSettings } from '@/modules/core/settings';
import { formatMinor } from './money';
import { computeTotals, PERIOD_LABEL, quantityFor, quoteFor, type PackagePricing } from './pricing';
import { paymentSettings } from './settings';
import { PAID_STATES, PAYABLE, canMove, type OrderStatusId } from './status';
import { runCancelHandlers, runPaidHandlers, runRefundHandlers, type PaidOrder } from './events';
import './handlers';

type Json = Prisma.InputJsonValue;
type Entry = Record<string, unknown>;
export type FullOrder = Order & { items: OrderItem[]; payments: Payment[] };

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const arr = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);
const now = () => new Date().toISOString();

export { orderNumber };

export const customerName = (o: Pick<Order, 'customer'>) => String((o.customer as Entry | null)?.name ?? 'there');

async function loadFull(where: Prisma.OrderWhereUniqueInput): Promise<FullOrder | null> {
  return getDb().order.findUnique({ where, include: { items: true, payments: { orderBy: { createdAt: 'asc' } } } });
}
export const getOrderByToken = (token: string) => loadFull({ token });
export const getOrderById = (id: string) => loadFull({ id });

async function appendHistory(orderId: string, entry: { by: string; from: string | null; to: string; note?: string }) {
  const db = getDb();
  const row = await db.order.findUnique({ where: { id: orderId }, select: { history: true } });
  await db.order.update({ where: { id: orderId }, data: { history: [...arr(row?.history), { at: now(), ...entry }] as Json } });
}

// ---------- placing an order ----------

export interface PlaceInput {
  packageSlug: string;
  period?: string | null;
  quantity?: number;
  name: string;
  email: string;
  phone: string;
  requirements: Record<string, string>;
  methodId: string;
  acceptTerms?: boolean;
  userId?: string | null;
  /** A coupon or referral code the buyer typed. */
  code?: string | null;
  /** The affiliate link cookie. */
  affiliateCode?: string | null;
}

interface RequirementDef {
  label?: string;
  kind?: string;
  required?: boolean;
  options?: string[];
}

/** Checks the buyer's answers against the questions the service asks. Unknown answers are dropped. */
export function checkRequirements(defs: unknown, answers: Record<string, string>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const def of (Array.isArray(defs) ? defs : []) as RequirementDef[]) {
    if (!def.label) continue;
    const value = (answers[def.label] ?? '').trim();
    if (!value) {
      if (def.required) throw new HttpError(422, `Please answer: ${def.label}`, `req:${def.label}`);
      continue;
    }
    if (def.kind === 'select' && !(def.options ?? []).includes(value)) throw new HttpError(422, `Choose one of the options for: ${def.label}`, `req:${def.label}`);
    out.push({ label: def.label, value: value.slice(0, 2000) });
  }
  return out;
}

/**
 * Creates an order from a package. Every price, period, tax and method is read or recomputed here from
 * the database and settings: the browser only says which package, which period and which method.
 */
export async function placeServiceOrder(input: PlaceInput): Promise<FullOrder> {
  const db = getDb();
  const pkg = await db.package.findFirst({ where: { slug: input.packageSlug, active: true, service: { active: true } }, include: { service: true } });
  if (!pkg) throw new HttpError(404, 'This package is not available any more.', 'package');
  if (pkg.mode !== 'buy') throw new HttpError(422, 'This package is quoted rather than bought online. Please request a quote.', 'package');

  const settings = await getSetting(paymentSettings);
  let quote;
  try {
    quote = quoteFor(pkg as PackagePricing, input.period);
  } catch (error) {
    throw new HttpError(422, error instanceof Error ? error.message : 'This period is not available.', 'period');
  }
  const quantity = quantityFor(pkg.billing, input.quantity);
  const subtotal = quote.unit * quantity;
  if (!(subtotal > 0)) throw new HttpError(422, 'This package has no price set yet. Please contact us.', 'package');
  let discount = 0;
  let source: DiscountSource | null = null;
  if (input.code?.trim()) {
    const found = await resolveDiscount(input.code, { email: input.email, scope: 'services', currency: pkg.currency, subtotal });
    if (!found.ok) throw new HttpError(422, found.message, 'code');
    discount = found.discount;
    source = found.source;
  }
  const affiliateId = await attributeAffiliate(input.affiliateCode, input.email);
  const totals = computeTotals({ subtotal, discount, taxRatePct: settings.taxRatePct, taxInclusive: settings.taxInclusive });

  const method = (await availableMethods()).find((m) => m.def.id === input.methodId);
  if (!method) throw new HttpError(422, 'That payment method is not available. Choose another.', 'method');
  if (settings.requireTerms && !input.acceptTerms) throw new HttpError(422, 'Please accept the terms to continue.', 'acceptTerms');
  const requirements = checkRequirements(pkg.service.requirements, input.requirements);

  const title = `${pkg.service.name}: ${pkg.name}${quote.period === 'once' ? '' : ` (${PERIOD_LABEL[quote.period]})`}`;
  const snapshot = {
    package: { id: pkg.id, name: pkg.name, slug: pkg.slug, tagline: pkg.tagline, price: pkg.price, priceMax: pkg.priceMax, billing: pkg.billing, monthlyYearly: pkg.monthlyYearly, yearlyDiscountPct: pkg.yearlyDiscountPct, yearlyPrice: pkg.yearlyPrice, deliveryDays: pkg.deliveryDays, features: pkg.features },
    service: { id: pkg.service.id, name: pkg.service.name, slug: pkg.service.slug },
    period: quote.period,
    quote,
    tax: { ratePct: settings.taxRatePct, inclusive: settings.taxInclusive, label: settings.taxLabel },
    discount: source ? { code: source.code, amount: discount } : null,
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const order = await db.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          number: orderNumber(settings.orderPrefix),
          token: randomBytes(32).toString('base64url'),
          userId: input.userId ?? null,
          email: input.email.toLowerCase(),
          customer: { name: input.name, phone: input.phone },
          currency: pkg.currency,
          ...totals,
          affiliateId,
          referrerId: source?.kind === 'referral' ? source.codeId : null,
          methodId: method.def.id,
          requirements: requirements as Json,
          history: [{ at: now(), by: 'customer', from: null, to: 'PENDING_PAYMENT', note: source ? `Order placed with code ${source.code}` : 'Order placed' }] as Json,
          items: { create: [{ kind: 'package', refId: pkg.id, title, quantity, unitPrice: quote.unit, snapshot: snapshot as unknown as Json }] },
        },
        include: { items: true, payments: true },
      });
      if (source) await recordDiscount(tx, source, created, discount);
      return created;
      });
      return order;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  throw new HttpError(500, 'Could not create an order number. Please try again.');
}

// ---------- paying ----------

/** Starts (or restarts) payment with a method. Returns where to send the buyer. */
export async function startPayment(order: FullOrder, methodId: string): Promise<CheckoutStart> {
  if (!(PAYABLE as readonly string[]).includes(order.status) && order.status !== 'VERIFYING') throw new HttpError(409, 'This order cannot be paid any more.');
  const state = (await availableMethods()).find((m) => m.def.id === methodId);
  const adapter = state ? await loadAdapter(methodId) : null;
  if (!state || !adapter) throw new HttpError(422, 'That payment method is not available. Choose another.', 'method');
  const [site, base] = await Promise.all([getSetting(siteSettings), baseUrl()]);
  const orderPage = `${base}/order/${order.token}`;
  const start = await adapter.createCheckout({
    orderId: order.id,
    orderNumber: order.number,
    total: { amount: order.total, currency: order.currency },
    description: order.items.map((i) => i.title).join(', ').slice(0, 200) || `Order ${order.number}`,
    customerEmail: order.email,
    customerName: customerName(order),
    customerPhone: String((order.customer as Entry | null)?.phone ?? ''),
    returnUrl: adapter.handleReturn ? `${base}/api/payments/${methodId}/return?order=${order.id}` : orderPage,
    cancelUrl: `${orderPage}?cancelled=1`,
    notifyUrl: `${base}/api/payments/${methodId}/webhook`,
    siteName: site.siteName,
  });
  const db = getDb();
  if (state.def.kind === 'manual') {
    // One open instruction row per manual order; the proof fills it in.
    const open = order.payments.find((p) => p.provider === methodId && p.status === 'pending');
    if (!open) await db.payment.create({ data: { orderId: order.id, provider: methodId, status: 'pending', amount: order.total, currency: order.currency } });
  } else {
    await db.payment.create({ data: { orderId: order.id, provider: methodId, status: 'pending', amount: order.total, currency: order.currency, reference: start.kind === 'redirect' ? start.reference : null } });
  }
  await db.order.update({ where: { id: order.id }, data: { methodId, ...(order.status === 'FAILED' ? { status: 'PENDING_PAYMENT' } : {}) } });
  if (order.status === 'FAILED') await appendHistory(order.id, { by: 'customer', from: 'FAILED', to: 'PENDING_PAYMENT', note: `Trying again with ${state.label}` });
  return start;
}

/** The payment instructions of a manual method, shown on the order page. */
export async function manualInstructions(order: FullOrder): Promise<Extract<CheckoutStart, { kind: 'instructions' }> | null> {
  if (!order.methodId) return null;
  const adapter = await loadAdapter(order.methodId);
  if (!adapter || adapter.kind !== 'manual') return null;
  const start = await adapter.createCheckout({ orderId: order.id, orderNumber: order.number, total: { amount: order.total, currency: order.currency }, description: '', customerEmail: order.email, customerName: customerName(order), returnUrl: '', cancelUrl: '', notifyUrl: '', siteName: '' });
  return start.kind === 'instructions' ? start : null;
}

// ---------- invoices and the paid pipeline ----------

/**
 * Invoice numbers run in order with no gaps: INV-2026-0001, 0002, ... Two orders paid at the same moment
 * may pick the same next number; the unique index lets only one keep it, and the other asks again for the
 * next free one. (Numbers are never offset, so a lost race never leaves a hole.)
 */
async function assignInvoiceNumber(orderId: string): Promise<string> {
  const db = getDb();
  const settings = await getSetting(paymentSettings);
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const rows = await db.$queryRawUnsafe<{ next: number }[]>(`SELECT COALESCE(MAX(CAST(split_part("invoiceNumber", '-', 3) AS INTEGER)), 0) + 1 AS next FROM "Order" WHERE "invoiceNumber" LIKE $1`, `${settings.invoicePrefix}-${year}-%`);
    const number = `${settings.invoicePrefix}-${year}-${String(Number(rows[0]?.next ?? 1)).padStart(4, '0')}`;
    try {
      await db.order.update({ where: { id: orderId }, data: { invoiceNumber: number } });
      return number;
    } catch (error) {
      if (!isUnique(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5 + Math.floor(Math.random() * 20)));
    }
  }
  throw new HttpError(500, 'Could not assign an invoice number. Please try again.');
}

/**
 * Moves an order to PAID once, whatever number of webhooks, returns or clicks arrive. The status change is
 * a single conditional update, so only the first caller runs the paid steps: invoice number, history,
 * module handlers (subscriptions, stock, rewards), the receipt and the owner alert.
 */
export async function markOrderPaid(orderId: string, by: string, note?: string): Promise<boolean> {
  const db = getDb();
  const changed = await db.order.updateMany({ where: { id: orderId, status: { in: ['PENDING_PAYMENT', 'VERIFYING', 'FAILED'] } }, data: { status: 'PAID', paidAt: new Date() } });
  if (changed.count === 0) return false;
  const row = await db.order.findUnique({ where: { id: orderId }, select: { history: true, invoiceNumber: true } });
  const invoice = row?.invoiceNumber ?? (await assignInvoiceNumber(orderId));
  await db.order.update({ where: { id: orderId }, data: { history: [...arr(row?.history), { at: now(), by, from: 'PENDING_PAYMENT', to: 'PAID', note: note ?? `Payment confirmed. Invoice ${invoice}` }] as Json } });
  const order = (await getOrderById(orderId)) as FullOrder;
  await runPaidHandlers(order as PaidOrder);
  await sendOrderEmail(order, 'order.paid');
  const owner = await ownerEmail();
  if (owner) await sendTemplate('owner.paid', owner, await emailVars(order), { entity: 'order', entityId: order.id });
  return true;
}

async function emailVars(order: FullOrder, extra: Record<string, string> = {}) {
  const base = await baseUrl();
  const method = (await availableMethods()).find((m) => m.def.id === order.methodId)?.label ?? order.methodId ?? '';
  return {
    name: customerName(order),
    number: order.number,
    package: order.items.map((i) => i.title).join(', '),
    total: formatMinor(order.total, order.currency),
    link: `${base}/order/${order.token}`,
    invoice_link: order.invoiceNumber ? `${base}/invoice/${order.token}` : '',
    method,
    ...extra,
  };
}

export async function sendOrderEmail(order: FullOrder, template: TemplateId, extra: Record<string, string> = {}): Promise<boolean> {
  return sendTemplate(template, order.email, await emailVars(order, extra), { entity: 'order', entityId: order.id });
}

const STATUS_EMAIL: Partial<Record<OrderStatusId, TemplateId>> = { IN_PROGRESS: 'order.started', SHIPPED: 'order.shipped', DELIVERED: 'order.delivered', COMPLETED: 'order.completed', CANCELLED: 'order.cancelled', REFUNDED: 'order.refunded' };

// ---------- applying gateway outcomes ----------

export type OutcomeResult = 'applied' | 'duplicate' | 'unknown_order' | 'ignored' | 'mismatch' | 'already_paid';

/**
 * Applies one gateway event. Idempotent: the event's key is stored with a unique index, so a repeated
 * webhook changes nothing. A paid event whose amount or currency differs from the order never marks it
 * paid: it is recorded as a mismatch and the owner is told.
 */
export async function applyOutcome(o: WebhookOutcome): Promise<OutcomeResult> {
  if (o.status === 'ignored') return 'ignored';
  const db = getDb();
  let order = o.orderId ? await getOrderById(o.orderId) : null;
  if (!order && o.reference) {
    const hit = await db.payment.findFirst({ where: { provider: o.provider, reference: o.reference }, select: { orderId: true } });
    if (hit) order = await getOrderById(hit.orderId);
  }
  if (!order) return 'unknown_order';
  const currency = o.amount?.currency.toUpperCase() ?? order.currency;

  const record = async (status: string, amount: number) => {
    try {
      await db.payment.create({ data: { orderId: order!.id, provider: o.provider, status, amount, currency, reference: o.reference ?? null, raw: o.raw as Json, idempotencyKey: o.idempotencyKey } });
      return true;
    } catch (error) {
      if (isUnique(error)) return false;
      throw error;
    }
  };

  if (o.status === 'paid') {
    const matches = o.amount && o.amount.amount === order.total && o.amount.currency.toUpperCase() === order.currency.toUpperCase();
    if (!matches) {
      if (!(await record('mismatch', o.amount?.amount ?? 0))) return 'duplicate';
      if (order.status === 'PENDING_PAYMENT' || order.status === 'FAILED') {
        await db.order.update({ where: { id: order.id }, data: { status: 'VERIFYING' } });
        await appendHistory(order.id, { by: o.provider, from: order.status, to: 'VERIFYING', note: `The gateway reported ${o.amount ? formatMinor(o.amount.amount, o.amount.currency) : 'no amount'}, but the order total is ${formatMinor(order.total, order.currency)}. Check it before marking the order paid.` });
      }
      const owner = await ownerEmail();
      if (owner) await sendTemplate('owner.attention', owner, await emailVars(order, { message: `A ${o.provider} payment did not match order ${order.number}: expected ${formatMinor(order.total, order.currency)}, gateway reported ${o.amount ? formatMinor(o.amount.amount, o.amount.currency) : 'nothing'}. The order was NOT marked paid.` }), { entity: 'order', entityId: order.id });
      return 'mismatch';
    }
    if (!(await record('paid', order.total))) return 'duplicate';
    return (await markOrderPaid(order.id, o.provider)) ? 'applied' : 'already_paid';
  }

  if (o.status === 'failed') {
    if (!(await record('failed', o.amount?.amount ?? order.total))) return 'duplicate';
    if (order.status === 'PENDING_PAYMENT') {
      await db.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      await appendHistory(order.id, { by: o.provider, from: 'PENDING_PAYMENT', to: 'FAILED', note: 'The payment did not go through' });
      await sendOrderEmail((await getOrderById(order.id)) as FullOrder, 'order.payment_failed', { message: 'The payment did not go through.' });
    }
    return 'applied';
  }

  // refunded
  const refundedBefore = order.payments.filter((p) => p.status === 'refunded' && p.provider === o.provider).reduce((n, p) => n + p.amount, 0);
  const delta = o.cumulative ? (o.amount?.amount ?? 0) - refundedBefore : (o.amount?.amount ?? 0);
  if (delta <= 0) return 'ignored';
  if (!(await record('refunded', delta))) return 'duplicate';
  await settleRefundStatus(order.id, 'gateway');
  return 'applied';
}

/** After a refund is recorded: a full refund moves a paid order to REFUNDED, a partial one is noted. */
async function settleRefundStatus(orderId: string, by: string) {
  const db = getDb();
  const order = (await getOrderById(orderId)) as FullOrder;
  const refunded = order.payments.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.amount, 0);
  if (refunded >= order.total && (PAID_STATES as readonly string[]).includes(order.status)) {
    await db.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });
    await appendHistory(orderId, { by, from: order.status, to: 'REFUNDED', note: `Refunded ${formatMinor(refunded, order.currency)}` });
    await sendOrderEmail((await getOrderById(orderId)) as FullOrder, 'order.refunded');
    await runRefundHandlers((await getOrderById(orderId)) as PaidOrder);
  } else if (refunded > 0) {
    await appendHistory(orderId, { by, from: order.status, to: order.status, note: `Partial refund recorded: ${formatMinor(refunded, order.currency)} of ${formatMinor(order.total, order.currency)}` });
  }
}

// ---------- gateway check-ins for payments still pending ----------

/**
 * Asks the gateway about an order still waiting for payment, for when the webhook is late or not set up
 * yet. At most once every 10 seconds per order.
 */
export async function refreshPending(order: FullOrder): Promise<boolean> {
  if (order.status !== 'PENDING_PAYMENT') return false;
  const pending = [...order.payments].reverse().find((p) => p.status === 'pending' && p.reference);
  if (!pending) return false;
  if (!(await rateLimit(`refresh:${order.id}`, { max: 1, windowMs: 10_000 })).ok) return false;
  try {
    const adapter = await loadAdapter(pending.provider);
    if (!adapter?.refresh) return false;
    const outcome = await adapter.refresh({ reference: pending.reference as string, order: { id: order.id, number: order.number, total: order.total, currency: order.currency } });
    return outcome ? (await applyOutcome(outcome)) === 'applied' : false;
  } catch (error) {
    console.error('[orders] refresh failed', error);
    return false;
  }
}

// ---------- manual payments ----------

export const PROOF_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const PROOF_MAX = 5 * 1024 * 1024;

/** A short-lived upload for a payment receipt. Only for the order's own token; images and PDFs up to 5 MB. */
export async function signProofUpload(order: FullOrder, mime: string, size: number) {
  const ext = PROOF_TYPES[mime];
  if (!ext) throw new HttpError(422, 'Upload a JPG, PNG, WebP or PDF file.');
  if (size > PROOF_MAX || size < 1) throw new HttpError(422, 'The file must be smaller than 5 MB.');
  const storage = getStorage();
  if (!storage.configured) throw new HttpError(409, 'Uploads are not available right now. Enter the transaction details instead, or contact us.');
  if (!(await rateLimit(`proof:${order.id}`, { max: 10, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many uploads. Please try again later.');
  return storage.signUpload({ key: `proofs/${order.id}/${randomBytes(6).toString('hex')}.${storage.id === 'cloudinary' ? '' : ext}`.replace(/\.$/, ''), mime, size });
}

export interface ManualPaymentInput {
  transactionId?: string;
  senderNumber?: string;
  note?: string;
  proof?: { key: string; mime: string; size: number };
}

/** The buyer says they paid. The order moves to VERIFYING and the owner is asked to check. */
export async function submitManualPayment(order: FullOrder, input: ManualPaymentInput): Promise<void> {
  const db = getDb();
  if (order.status !== 'PENDING_PAYMENT' && order.status !== 'FAILED' && order.status !== 'VERIFYING') throw new HttpError(409, 'This order does not need a payment confirmation.');
  const methods = await availableMethods();
  const method = methods.find((m) => m.def.id === order.methodId);
  if (!method || method.def.kind !== 'manual') throw new HttpError(409, 'Choose a manual payment method first.');
  if (order.payments.filter((p) => p.status === 'submitted').length >= 5) throw new HttpError(429, 'You have already sent several confirmations. We will check them soon.');

  const tx = input.transactionId?.trim() ?? '';
  if (method.def.proof === 'transaction' && !/^[A-Za-z0-9._-]{4,64}$/.test(tx)) throw new HttpError(422, 'Enter the transaction ID from your payment message (letters and numbers, 4 to 64 characters).', 'transactionId');
  if (method.def.proof === 'upload' && !input.proof && !tx) throw new HttpError(422, 'Upload your receipt or enter the transaction reference.', 'proof');

  let proof: Entry = { transactionId: tx || null, sender: input.senderNumber?.trim().slice(0, 40) || null, note: input.note?.trim().slice(0, 500) || null };
  if (input.proof) {
    if (!input.proof.key.includes(`proofs/${order.id}/`)) throw new HttpError(422, 'That upload does not belong to this order.');
    const storage = getStorage();
    const head = await storage.read(input.proof.key, 4096).catch(() => null);
    const found = head ? sniff(head, input.proof.mime) : null;
    if (!found || !(found.kind === 'image' || found.kind === 'pdf')) {
      await storage.delete(input.proof.key).catch(() => undefined);
      throw new HttpError(422, 'The file is not a picture or PDF, so it was removed. Upload your receipt again.');
    }
    proof = { ...proof, url: storage.url(input.proof.key), key: input.proof.key, mime: found.mime, size: input.proof.size };
  }
  if (tx) {
    const clash = await db.payment.findFirst({ where: { provider: method.def.id, reference: tx, orderId: { not: order.id }, status: { in: ['submitted', 'verified'] } }, include: { order: { select: { number: true } } } });
    if (clash) proof = { ...proof, duplicateOf: clash.order.number };
  }

  const open = order.payments.find((p) => p.provider === method.def.id && p.status === 'pending');
  const data = { status: 'submitted', reference: tx || null, proof: proof as Json };
  if (open) await db.payment.update({ where: { id: open.id }, data });
  else await db.payment.create({ data: { orderId: order.id, provider: method.def.id, amount: order.total, currency: order.currency, ...data } });
  if (order.status !== 'VERIFYING') {
    await db.order.update({ where: { id: order.id }, data: { status: 'VERIFYING' } });
    await appendHistory(order.id, { by: 'customer', from: order.status, to: 'VERIFYING', note: `Payment confirmation sent by ${method.label}${tx ? `, transaction ${tx}` : ''}${proof.duplicateOf ? `. This transaction ID was also used on order ${String(proof.duplicateOf)}.` : ''}` });
  }
  const owner = await ownerEmail();
  if (owner) await sendTemplate('owner.proof', owner, await emailVars(order, { transaction: tx || 'receipt uploaded', method: method.label }), { entity: 'order', entityId: order.id });
}

/** Owner decision on a submitted manual payment. */
export async function verifyPayment(orderId: string, paymentId: string, approve: boolean, by: string, reason?: string): Promise<void> {
  const db = getDb();
  const payment = await db.payment.findFirst({ where: { id: paymentId, orderId } });
  if (!payment || payment.status !== 'submitted') throw new HttpError(409, 'This payment is not waiting for a decision.');
  if (approve) {
    await db.payment.update({ where: { id: paymentId }, data: { status: 'verified' } });
    await markOrderPaid(orderId, by, 'Payment verified by staff');
  } else {
    await db.payment.update({ where: { id: paymentId }, data: { status: 'rejected' } });
    const order = (await getOrderById(orderId)) as FullOrder;
    if (order.status === 'VERIFYING') {
      await db.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });
      await appendHistory(orderId, { by, from: 'VERIFYING', to: 'FAILED', note: reason || 'Payment could not be verified' });
      await sendOrderEmail((await getOrderById(orderId)) as FullOrder, 'order.payment_failed', { message: reason || 'We could not find your payment. Please check the details and send them again.' });
    }
  }
}

// ---------- staff actions ----------

export interface StaffRef {
  id: string;
  name: string;
}

/** Moves an order along the allowed path. PAID and REFUNDED go through the same pipelines as real payments and refunds. */
export async function changeStatus(orderId: string, to: OrderStatusId, staff: StaffRef, opts: { note?: string; notify?: boolean } = {}): Promise<void> {
  const db = getDb();
  const order = await getOrderById(orderId);
  if (!order) throw new HttpError(404, 'This order no longer exists.');
  const from = order.status as OrderStatusId;
  if (from === to) throw new HttpError(409, 'The order already has this status.');
  if (!canMove(from, to)) throw new HttpError(422, `An order cannot go from "${from.toLowerCase().replace(/_/g, ' ')}" to "${to.toLowerCase().replace(/_/g, ' ')}".`);
  if (to === 'PAID') {
    await db.payment.create({ data: { orderId, provider: order.methodId ?? 'manual', status: 'verified', amount: order.total, currency: order.currency, reference: `Marked paid by ${staff.name}`, idempotencyKey: `staff:paid:${orderId}` } }).catch((e) => {
      if (!isUnique(e)) throw e;
    });
    await markOrderPaid(orderId, staff.name, opts.note || 'Marked as paid by staff');
  } else if (to === 'REFUNDED') {
    const refunded = order.payments.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.amount, 0);
    await recordRefund(orderId, order.total - refunded, staff, opts.note);
  } else {
    await db.order.update({ where: { id: orderId }, data: { status: to } });
    await appendHistory(orderId, { by: staff.name, from, to, note: opts.note });
    const template = STATUS_EMAIL[to];
    if (template && opts.notify !== false) await sendOrderEmail((await getOrderById(orderId)) as FullOrder, template);
    if (to === 'CANCELLED') await runCancelHandlers((await getOrderById(orderId)) as PaidOrder);
  }
  await writeAudit({ userId: staff.id, action: 'order.status', entity: 'order', entityId: orderId, diff: { from, to } });
}

/** Records a refund. This only records it: the money must be returned in the gateway or the bank. */
export async function recordRefund(orderId: string, amount: number, staff: StaffRef, reason?: string): Promise<void> {
  const db = getDb();
  const order = await getOrderById(orderId);
  if (!order) throw new HttpError(404, 'This order no longer exists.');
  if (!(PAID_STATES as readonly string[]).includes(order.status) && order.status !== 'REFUNDED') throw new HttpError(422, 'Only a paid order can be refunded.');
  const refunded = order.payments.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.amount, 0);
  if (!Number.isInteger(amount) || amount < 1) throw new HttpError(422, 'Enter an amount to refund.');
  if (amount > order.total - refunded) throw new HttpError(422, `You can refund at most ${formatMinor(order.total - refunded, order.currency)}.`);
  await db.payment.create({ data: { orderId, provider: order.methodId ?? 'manual', status: 'refunded', amount, currency: order.currency, reference: reason?.slice(0, 200) || `Refund recorded by ${staff.name}` } });
  await settleRefundStatus(orderId, staff.name);
  await writeAudit({ userId: staff.id, action: 'order.refund', entity: 'order', entityId: orderId, diff: { amount, reason: reason ?? null } });
}

export async function addNote(orderId: string, text: string, staff: StaffRef): Promise<void> {
  const db = getDb();
  const row = await db.order.findUnique({ where: { id: orderId }, select: { notes: true } });
  if (!row) throw new HttpError(404, 'This order no longer exists.');
  await db.order.update({ where: { id: orderId }, data: { notes: [...arr(row.notes), { at: now(), by: staff.name, text: text.slice(0, 2000) }] as Json } });
}

/** A progress update (and optionally a file) the customer sees on their order page. */
export async function addUpdate(orderId: string, input: { text: string; fileUrl?: string; fileName?: string; notify: boolean }, staff: StaffRef): Promise<void> {
  const db = getDb();
  const row = await db.order.findUnique({ where: { id: orderId }, select: { updates: true } });
  if (!row) throw new HttpError(404, 'This order no longer exists.');
  const entry = { at: now(), by: staff.name, text: input.text.slice(0, 2000), fileUrl: input.fileUrl || null, fileName: input.fileName?.slice(0, 120) || null };
  await db.order.update({ where: { id: orderId }, data: { updates: [...arr(row.updates), entry] as Json } });
  if (input.notify) await sendOrderEmail((await getOrderById(orderId)) as FullOrder, 'order.update', { message: input.text });
  await writeAudit({ userId: staff.id, action: 'order.update', entity: 'order', entityId: orderId });
}
