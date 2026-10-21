import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Order, OrderItem, Payment, Prisma, ProductVariant, StoreProduct } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { HttpError } from '@/lib/http/errors';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { availableMethods } from '@/lib/adapters/payments';
import { getSetting } from '@/lib/settings/store';
import { ownerEmail, sendTemplate } from '@/lib/mail/send';
import { baseUrl } from '@/lib/url';
import { formatMinor } from '@/lib/checkout/money';
import { orderNumber } from '@/lib/checkout/numbers';
import { paymentSettings } from '@/lib/checkout/settings';
import { PAID_STATES } from '@/lib/checkout/status';
import { runCancelHandlers } from '@/lib/checkout/events';
import { allocateDiscount } from '@/lib/growth/logic';
import { attributeAffiliate, recordDiscount, resolveDiscount, type DiscountSource } from '@/lib/growth/engine';
import { storeSettings, type StoreSettings } from './settings';
import {
  checkAddress, cleanOptions, computeStoreTotals, expandVariants, MAX_QUANTITY, ratesFor, shippingCost, stockState, taxRateFor, variantKey, withRateIds,
  type Address, type CartLine, type ShippingRate,
} from './logic';

type Json = Prisma.InputJsonValue;
type Entry = Record<string, unknown>;
type Tx = Prisma.TransactionClient;
type FullOrder = Order & { items: OrderItem[]; payments: Payment[] };
export type VariantWithProduct = ProductVariant & { product: StoreProduct };

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
const arr = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);
const nowIso = () => new Date().toISOString();

export const storeCurrency = async (): Promise<string> => (await getSetting(storeSettings)).currency;

// ---------- variants ----------

interface VariantRow {
  key: string;
  label: string;
  sku: string | null;
  price: number | null;
  active: boolean;
  image: string | null;
  stock: number;
}

/**
 * Makes the variant rows match the product's options. New combinations are created with no stock (a product
 * without options gets its starting stock once). Combinations that no longer exist are switched off, never
 * deleted, because old orders point at them. Settings from the editor (sku, price, active, image) are copied
 * onto matching rows; stock is never written here, only in the inventory screen or by sales.
 * Returns the rows to show in the editor.
 */
export async function syncVariants(productId: string): Promise<VariantRow[]> {
  const db = getDb();
  const product = await db.storeProduct.findUnique({ where: { id: productId } });
  if (!product) return [];
  const options = cleanOptions(product.options);
  const specs = expandVariants(options);
  const edits = new Map(arr(product.variants).map((v) => [String(v.key ?? ''), v]));
  const existing = new Map((await db.productVariant.findMany({ where: { productId } })).map((v) => [v.key, v]));

  let order = 0;
  for (const spec of specs) {
    order += 1;
    const edit = edits.get(spec.key) ?? {};
    const row = existing.get(spec.key);
    const sku = typeof edit.sku === 'string' && edit.sku.trim() ? edit.sku.trim().slice(0, 60) : spec.key === '' ? product.sku : null;
    const price = typeof edit.price === 'number' && edit.price > 0 ? Math.round(edit.price) : null;
    const image = typeof edit.image === 'string' && edit.image ? edit.image : null;
    const active = edit.active === false ? false : true;
    if (row) {
      await db.productVariant.update({ where: { id: row.id }, data: { label: spec.label, sku, price, image, active, order } });
    } else {
      const start = spec.key === '' && product.trackStock ? Math.max(0, product.startStock) : 0;
      const created = await db.productVariant.create({ data: { productId, key: spec.key, label: spec.label, sku, price, image, active, order, stock: start } });
      if (start > 0) await db.stockMovement.create({ data: { variantId: created.id, delta: start, balance: start, reason: 'initial', note: 'Starting stock' } });
    }
  }
  const wanted = new Set(specs.map((s) => s.key));
  for (const [key, row] of existing) if (!wanted.has(key) && row.active) await db.productVariant.update({ where: { id: row.id }, data: { active: false } });

  const rows = await db.productVariant.findMany({ where: { productId, active: true }, orderBy: { order: 'asc' } });
  const shown: VariantRow[] = rows.map((r) => ({ key: r.key, label: r.label, sku: r.sku, price: r.price, active: r.active, image: r.image, stock: r.stock }));
  // Simple products have no rows worth editing.
  await db.storeProduct.update({ where: { id: productId }, data: { variants: (options.length ? shown : []) as unknown as Json } });
  return options.length ? shown : [];
}

// ---------- stock ----------

/** Lower stock by `quantity` in one statement. Returns the new balance, or null when there was not enough. */
async function takeStock(tx: Tx, variantId: string, quantity: number): Promise<number | null> {
  const rows = await tx.$queryRaw<{ stock: number }[]>`UPDATE "ProductVariant" SET stock = stock - ${quantity}, "updatedAt" = now() WHERE id = ${variantId} AND stock >= ${quantity} RETURNING stock`;
  return rows[0]?.stock ?? null;
}

async function putStock(tx: Tx, variantId: string, quantity: number): Promise<number> {
  const rows = await tx.$queryRaw<{ stock: number }[]>`UPDATE "ProductVariant" SET stock = stock + ${quantity}, "updatedAt" = now() WHERE id = ${variantId} RETURNING stock`;
  return rows[0]?.stock ?? 0;
}

/** Staff: add to or remove from stock, with a reason that stays in the history. */
export async function adjustStock(variantId: string, delta: number, note: string, by: { id: string; name: string }): Promise<number> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) throw new HttpError(422, 'Enter a whole number of items, more or less than zero.');
  const db = getDb();
  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant) throw new HttpError(404, 'This variant no longer exists.');
  const balance = await db.$transaction(async (tx) => {
    const next = delta > 0 ? await putStock(tx, variantId, delta) : await takeStock(tx, variantId, -delta);
    if (next === null) throw new HttpError(422, `There are only ${variant.stock} in stock, so you cannot remove ${-delta}.`);
    await tx.stockMovement.create({ data: { variantId, delta, balance: next, reason: delta > 0 ? 'restock' : 'adjust', note: note.slice(0, 200) || null, by: by.name } });
    return next;
  });
  await writeAudit({ userId: by.id, action: 'stock.adjust', entity: 'variant', entityId: variantId, diff: { delta, balance } });
  return balance;
}

/** Puts back the stock an order had set aside. Safe to call twice: each variant is released once per order. */
export async function releaseOrderStock(orderId: string): Promise<number> {
  const db = getDb();
  const sold = await db.stockMovement.findMany({ where: { orderId, reason: 'sale' } });
  let released = 0;
  for (const move of sold) {
    const already = await db.stockMovement.findUnique({ where: { orderId_variantId_reason: { orderId, variantId: move.variantId, reason: 'release' } } });
    if (already) continue;
    try {
      await db.$transaction(async (tx) => {
        const balance = await putStock(tx, move.variantId, -move.delta);
        await tx.stockMovement.create({ data: { variantId: move.variantId, delta: -move.delta, balance, reason: 'release', orderId, note: 'The order was cancelled or not paid in time' } });
      });
      released += 1;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  return released;
}

async function lowStockAlert(variantIds: string[]): Promise<void> {
  const settings = await getSetting(storeSettings);
  if (!settings.lowStockEmail) return;
  const owner = await ownerEmail();
  if (!owner) return;
  const base = await baseUrl();
  for (const id of variantIds) {
    const v = await getDb().productVariant.findUnique({ where: { id }, include: { product: true } });
    if (!v || !v.product.trackStock) continue;
    const state = stockState({ trackStock: true, stock: v.stock, lowStockAt: v.product.lowStockAt });
    if (state === 'in') continue;
    const name = `${v.product.name}${v.key ? ` (${v.label})` : ''}`;
    await sendTemplate('owner.lowstock', owner, { package: name, message: state === 'out' ? `${name} is sold out.` : `${name} is running low: ${v.stock} left.`, link: `${base}/admin/inventory` }, { entity: 'variant', entityId: v.id });
  }
}

// ---------- reading ----------

/** The variants a cart refers to, with their products. Missing or switched-off ones are simply absent. */
export async function loadCartVariants(lines: readonly CartLine[]): Promise<Map<string, VariantWithProduct>> {
  if (lines.length === 0) return new Map();
  const rows = await getDb().productVariant.findMany({ where: { id: { in: lines.map((l) => l.v) }, active: true, product: { status: 'PUBLISHED' } }, include: { product: true } });
  return new Map(rows.map((r) => [r.id, r]));
}

export const unitPrice = (v: VariantWithProduct): number => v.price ?? v.product.price;
export const lineTitle = (v: Pick<ProductVariant, 'key' | 'label'> & { product: Pick<StoreProduct, 'name'> }): string => (v.key ? `${v.product.name} (${v.label})` : v.product.name);

// ---------- quoting and placing an order ----------

export interface BasketInput {
  lines: readonly CartLine[];
  /** Delivery address for physical goods. */
  address?: unknown;
  /** Country for tax on digital-only orders. */
  billingCountry?: string;
  shippingRateId?: string | null;
  /** A coupon or referral code the buyer typed, and their email (some codes depend on it). */
  code?: string | null;
  email?: string;
}

export interface BasketLine {
  variantId: string;
  productId: string;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  kind: string;
  taxRatePct: number;
  tax: number;
  image: string | null;
  stock: number | null;
}

export interface Basket {
  currency: string;
  lines: BasketLine[];
  needsShipping: boolean;
  rates: { id: string; name: string; price: number }[];
  chosenRate: ShippingRate | null;
  address: Address | null;
  taxCountry: string;
  totals: { subtotal: number; discount: number; shipping: number; tax: number; total: number };
  inclusive: boolean;
  weightGrams: number;
  /** The code applied, with what it saved. */
  discount: { code: string; label: string; amount: number; freeShipping: boolean } | null;
  /** Where the discount came from. Kept on the server: never sent to the browser. */
  source: DiscountSource | null;
  problems: string[];
}

/**
 * Prices a cart from the database: product prices, stock, tax by class and country, and the shipping rate.
 * Nothing about prices ever comes from the browser. `problems` lists everything that blocks an order; the
 * cart page shows them, and placing the order refuses when there are any.
 */
export async function priceBasket(input: BasketInput): Promise<Basket> {
  const [settings, pay, byId] = await Promise.all([getSetting(storeSettings), getSetting(paymentSettings), loadCartVariants(input.lines)]);
  const problems: string[] = [];
  const lines: BasketLine[] = [];
  const raw: { line: BasketLine; classId: string; weight: number }[] = [];

  for (const l of input.lines) {
    const v = byId.get(l.v);
    if (!v) {
      problems.push('An item in your cart is no longer available. Remove it to continue.');
      continue;
    }
    const q = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(l.q)));
    const p = v.product;
    const price = unitPrice(v);
    if (p.currency !== settings.currency) problems.push(`${lineTitle(v)} is not sold in the store currency.`);
    else if (!(price > 0)) problems.push(`${lineTitle(v)} has no price yet.`);
    if (p.trackStock && v.stock < q) problems.push(v.stock <= 0 ? `${lineTitle(v)} is sold out.` : `Only ${v.stock} of ${lineTitle(v)} left. Lower the quantity.`);
    const line: BasketLine = { variantId: v.id, productId: p.id, title: lineTitle(v), sku: v.sku ?? p.sku, quantity: q, unitPrice: price, amount: price * q, kind: p.kind, taxRatePct: 0, tax: 0, image: v.image ?? p.images[0] ?? null, stock: p.trackStock ? v.stock : null };
    raw.push({ line, classId: p.taxClass, weight: p.kind === 'physical' ? p.weightGrams * q : 0 });
    lines.push(line);
  }
  if (input.lines.length === 0) problems.push('Your cart is empty.');

  const needsShipping = lines.some((l) => l.kind === 'physical');
  const weightGrams = raw.reduce((n, r) => n + r.weight, 0);
  const subtotal = lines.reduce((n, l) => n + l.amount, 0);
  const units = lines.filter((l) => l.kind === 'physical').reduce((n, l) => n + l.quantity, 0);

  let address: Address | null = null;
  let taxCountry = (input.billingCountry ?? '').trim().toUpperCase();
  if (needsShipping && input.address) {
    const checked = checkAddress(input.address);
    if (checked.ok) {
      address = checked.address;
      taxCountry = checked.address.country;
    }
  }

  const allRates = withRateIds(settings.shippingRates.map((r) => ({ ...r, price: r.price ?? 0, perKg: r.perKg ?? 0 })));
  const available = needsShipping && address ? ratesFor(allRates, address.country) : [];
  const priced = available.map((r) => ({ rate: r, price: shippingCost(r, { subtotal, weightGrams, units }) }));
  const chosen = priced.find((r) => r.rate.id === input.shippingRateId) ?? null;
  if (needsShipping && address) {
    if (priced.length === 0) problems.push('We do not ship to that country.');
    else if (!chosen) problems.push('Choose a shipping method.');
  }

  for (const r of raw) r.line.taxRatePct = taxRateFor(settings.taxClasses, settings.taxOverrides, r.classId, taxCountry);

  // A coupon or referral code. The discount comes off the products and is shared across lines so tax follows it.
  let source: DiscountSource | null = null;
  let discount = 0;
  let freeShipping = false;
  let discountLabel = '';
  if (input.code?.trim() && lines.length) {
    const found = await resolveDiscount(input.code, { email: input.email ?? '', scope: 'products', currency: settings.currency, subtotal });
    if (found.ok) {
      source = found.source;
      discount = found.discount;
      freeShipping = found.freeShipping;
      discountLabel = found.label;
    } else problems.push(found.message);
  }
  const shares = allocateDiscount(lines.map((l) => l.amount), discount);
  const fullShipping = chosen?.price ?? 0;
  const shipping = freeShipping ? 0 : fullShipping;
  const shippingRatePct = settings.shippingTaxClass ? taxRateFor(settings.taxClasses, settings.taxOverrides, settings.shippingTaxClass, taxCountry) : 0;
  const totals = computeStoreTotals({ lines: lines.map((l, i) => ({ amount: l.amount - (shares[i] ?? 0), ratePct: l.taxRatePct })), shipping, shippingRatePct, inclusive: pay.taxInclusive });
  lines.forEach((l, i) => (l.tax = totals.lineTax[i] ?? 0));
  const saved = discount > 0 ? discount : freeShipping ? fullShipping : 0;

  return {
    currency: settings.currency,
    lines,
    needsShipping,
    rates: priced.map((r) => ({ id: r.rate.id, name: r.rate.name, price: r.price })),
    chosenRate: chosen?.rate ?? null,
    address,
    taxCountry,
    totals: { subtotal, discount, shipping: totals.shipping, tax: totals.tax, total: totals.total },
    inclusive: pay.taxInclusive,
    weightGrams,
    discount: source ? { code: source.code, label: discountLabel, amount: saved, freeShipping } : null,
    source,
    problems: [...new Set(problems)],
  };
}

export interface PlaceStoreInput extends BasketInput {
  name: string;
  email: string;
  phone: string;
  methodId: string;
  acceptTerms?: boolean;
  userId?: string | null;
  /** The affiliate link cookie. */
  affiliateCode?: string | null;
}

/**
 * Creates the order and sets the stock aside in one transaction, so two buyers can never both take the last
 * item. If the stock is gone by the time we get there, nothing is created.
 */
export async function placeStoreOrder(input: PlaceStoreInput): Promise<FullOrder> {
  const db = getDb();
  const [pay, store] = await Promise.all([getSetting(paymentSettings), getSetting(storeSettings)]);
  const basket = await priceBasket({ ...input, email: input.email.toLowerCase() });
  if (basket.problems.length) throw new HttpError(422, basket.problems[0] as string, 'cart');
  if (basket.needsShipping && !basket.address) {
    const checked = checkAddress(input.address);
    throw new HttpError(422, checked.ok ? 'Enter the delivery address.' : (Object.values(checked.errors)[0] as string), 'address');
  }
  if (!basket.needsShipping && !/^[A-Z]{2}$/.test(basket.taxCountry)) throw new HttpError(422, 'Choose your country. It decides the tax on digital products.', 'billingCountry');
  const method = (await availableMethods()).find((m) => m.def.id === input.methodId);
  if (!method) throw new HttpError(422, 'That payment method is not available. Choose another.', 'method');
  if (pay.requireTerms && !input.acceptTerms) throw new HttpError(422, 'Please accept the terms to continue.', 'acceptTerms');
  if (basket.totals.total <= 0) throw new HttpError(422, 'This order has no amount to pay.', 'cart');

  const affiliateId = await attributeAffiliate(input.affiliateCode, input.email);
  const byId = await loadCartVariants(input.lines);
  const files = (v: VariantWithProduct) => (v.product.kind === 'digital' ? arr(v.product.digitalFiles).map((f) => ({ name: String(f.name ?? 'File').slice(0, 120), url: String(f.url ?? '') })) : []);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const order = await db.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            number: orderNumber(pay.orderPrefix),
            token: randomBytes(32).toString('base64url'),
            userId: input.userId ?? null,
            email: input.email.toLowerCase(),
            customer: { name: input.name, phone: input.phone },
            currency: basket.currency,
            subtotal: basket.totals.subtotal,
            discount: basket.totals.discount,
            affiliateId,
            referrerId: basket.source?.kind === 'referral' ? basket.source.codeId : null,
            shipping: basket.totals.shipping,
            tax: basket.totals.tax,
            total: basket.totals.total,
            methodId: method.def.id,
            shippingAddress: basket.address ? (basket.address as unknown as Json) : undefined,
            billingAddress: { country: basket.taxCountry } as Json,
            history: [{ at: nowIso(), by: 'customer', from: null, to: 'PENDING_PAYMENT', note: basket.discount ? `Order placed with code ${basket.discount.code}` : 'Order placed' }] as Json,
            requirements: basket.chosenRate ? ([{ label: 'Shipping method', value: basket.chosenRate.name }] as Json) : undefined,
            items: {
              create: basket.lines.map((l) => {
                const v = byId.get(l.variantId) as VariantWithProduct;
                return {
                  kind: 'product', refId: l.variantId, title: l.title, sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice,
                  snapshot: { product: { id: v.product.id, name: v.product.name, slug: v.product.slug, kind: v.product.kind, taxClass: v.product.taxClass, weightGrams: v.product.weightGrams, downloadLimit: v.product.downloadLimit, downloadDays: v.product.downloadDays, files: files(v) }, variant: { id: v.id, key: v.key, label: v.label }, taxRatePct: l.taxRatePct, tax: l.tax, inclusive: basket.inclusive } as Json,
                };
              }),
            },
          },
          include: { items: true, payments: true },
        });
        if (basket.source && basket.discount) await recordDiscount(tx, basket.source, created, basket.discount.amount);
        for (const l of basket.lines) {
          const v = byId.get(l.variantId) as VariantWithProduct;
          if (!v.product.trackStock) continue;
          const balance = await takeStock(tx, v.id, l.quantity);
          if (balance === null) throw new HttpError(409, `${l.title} was just sold out. Please update your cart.`, 'cart');
          await tx.stockMovement.create({ data: { variantId: v.id, delta: -l.quantity, balance, reason: 'sale', orderId: created.id, note: `Order ${created.number}` } });
        }
        return created;
      });
      void lowStockAlert(basket.lines.filter((l) => l.stock !== null).map((l) => l.variantId)).catch((e) => console.error('[store] low stock alert failed', e));
      void store;
      return order;
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }
  throw new HttpError(500, 'Could not create an order number. Please try again.');
}

// ---------- paid and unpaid orders ----------

/** Digital-only orders are complete as soon as they are paid: the files are on the order page. */
export async function handlePaidStoreOrder(order: FullOrder): Promise<void> {
  const products = order.items.filter((i) => i.kind === 'product');
  if (products.length === 0 || products.length !== order.items.length) return;
  const allDigital = products.every((i) => ((i.snapshot ?? {}) as { product?: { kind?: string } }).product?.kind === 'digital');
  if (!allDigital) return;
  const db = getDb();
  const changed = await db.order.updateMany({ where: { id: order.id, status: 'PAID' }, data: { status: 'COMPLETED' } });
  if (!changed.count) return;
  const row = await db.order.findUnique({ where: { id: order.id }, select: { history: true } });
  await db.order.update({ where: { id: order.id }, data: { history: [...arr(row?.history), { at: nowIso(), by: 'system', from: 'PAID', to: 'COMPLETED', note: 'Digital order: the files are ready to download' }] as Json } });
}

export interface ExpireSummary {
  cancelled: number;
  released: number;
}

/** Cancels store orders nobody paid within the hold time and puts their stock back on sale. */
export async function expireUnpaidOrders(now = new Date()): Promise<ExpireSummary> {
  const db = getDb();
  const settings = await getSetting(storeSettings);
  const cutoff = new Date(now.getTime() - settings.holdHours * 3_600_000);
  const stale = await db.order.findMany({
    where: { status: { in: ['PENDING_PAYMENT', 'FAILED'] }, createdAt: { lt: cutoff }, items: { some: { kind: 'product' } }, payments: { none: { status: { in: ['submitted', 'verified', 'paid'] } } } },
    select: { id: true, history: true, status: true },
    take: 200,
  });
  const summary: ExpireSummary = { cancelled: 0, released: 0 };
  for (const o of stale) {
    const changed = await db.order.updateMany({ where: { id: o.id, status: { in: ['PENDING_PAYMENT', 'FAILED'] } }, data: { status: 'CANCELLED' } });
    if (!changed.count) continue;
    await db.order.update({ where: { id: o.id }, data: { history: [...arr(o.history), { at: nowIso(), by: 'system', from: o.status, to: 'CANCELLED', note: `Not paid within ${settings.holdHours} hours, so the stock was put back on sale` }] as Json } });
    summary.cancelled += 1;
    summary.released += await releaseOrderStock(o.id);
    await runCancelHandlers((await db.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true, payments: true } })) as FullOrder);
    const full = await db.order.findUnique({ where: { id: o.id }, include: { items: true } });
    if (full) {
      const base = await baseUrl();
      await sendTemplate('order.cancelled', full.email, { name: String((full.customer as Entry | null)?.name ?? 'there'), number: full.number, package: full.items.map((i) => i.title).join(', '), total: formatMinor(full.total, full.currency), link: `${base}/order/${full.token}` }, { entity: 'order', entityId: full.id });
    }
  }
  return summary;
}

// ---------- digital downloads ----------

export type DownloadResult = { ok: true; url: string; name: string } | { ok: false; status: number; message: string };

/**
 * Checks everything before a file is handed out: a paid order, a digital item, the file exists, the link has
 * not expired and the download limit is not used up. The count goes up in the same statement that checks it.
 */
export async function claimDownload(orderToken: string, itemId: string, fileIndex: number): Promise<DownloadResult> {
  const db = getDb();
  const order = await db.order.findUnique({ where: { token: orderToken }, include: { items: true } });
  if (!order) return { ok: false, status: 404, message: 'This download was not found.' };
  if (!(PAID_STATES as readonly string[]).includes(order.status)) return { ok: false, status: 403, message: 'Downloads open once the order is paid.' };
  if (!(await rateLimit(`dl:${order.id}`, { max: 60, windowMs: 3_600_000 })).ok) return { ok: false, status: 429, message: 'Too many downloads. Please try again later.' };
  const item = order.items.find((i) => i.id === itemId && i.kind === 'product');
  const snap = ((item?.snapshot ?? {}) as { product?: { kind?: string; files?: { name: string; url: string }[]; downloadLimit?: number; downloadDays?: number } }).product;
  const file = snap?.kind === 'digital' ? snap.files?.[fileIndex] : undefined;
  if (!item || !file || !/^(https:\/\/|\/)/.test(file.url) || file.url.startsWith('//')) return { ok: false, status: 404, message: 'This download was not found.' };
  const days = snap?.downloadDays ?? 0;
  if (days > 0 && order.paidAt && order.paidAt.getTime() + days * 86_400_000 < Date.now()) return { ok: false, status: 410, message: `Downloads for this order were open for ${days} days and have ended. Please contact us.` };
  const limit = snap?.downloadLimit ?? 0;
  await db.downloadGrant.upsert({ where: { orderId_itemId_fileIndex: { orderId: order.id, itemId, fileIndex } }, create: { orderId: order.id, itemId, fileIndex }, update: {} });
  const taken = limit > 0
    ? await db.$executeRaw`UPDATE "DownloadGrant" SET count = count + 1, "lastAt" = now() WHERE "orderId" = ${order.id} AND "itemId" = ${itemId} AND "fileIndex" = ${fileIndex} AND count < ${limit}`
    : await db.$executeRaw`UPDATE "DownloadGrant" SET count = count + 1, "lastAt" = now() WHERE "orderId" = ${order.id} AND "itemId" = ${itemId} AND "fileIndex" = ${fileIndex}`;
  if (taken === 0) return { ok: false, status: 429, message: `This file can be downloaded ${limit} times and that limit has been reached. Please contact us if you need it again.` };
  return { ok: true, url: file.url, name: file.name };
}

/** Download links for an order page. */
export async function downloadsFor(order: FullOrder): Promise<{ itemId: string; title: string; files: { index: number; name: string; used: number; limit: number }[] }[]> {
  if (!(PAID_STATES as readonly string[]).includes(order.status)) return [];
  const grants = await getDb().downloadGrant.findMany({ where: { orderId: order.id } });
  const out: { itemId: string; title: string; files: { index: number; name: string; used: number; limit: number }[] }[] = [];
  for (const item of order.items) {
    const snap = ((item.snapshot ?? {}) as { product?: { kind?: string; files?: { name: string }[]; downloadLimit?: number } }).product;
    if (item.kind !== 'product' || snap?.kind !== 'digital' || !snap.files?.length) continue;
    out.push({ itemId: item.id, title: item.title, files: snap.files.map((f, index) => ({ index, name: f.name, used: grants.find((g) => g.itemId === item.id && g.fileIndex === index)?.count ?? 0, limit: snap.downloadLimit ?? 0 })) });
  }
  return out;
}

export { variantKey };
export type { StoreSettings };
