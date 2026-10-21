/**
 * The store engine against a real database: variants from options, pricing a cart on the server, stock set aside
 * in the same transaction as the order, cancelling and expiry, and digital downloads. Runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { saveSetting } from '@/lib/settings/store';
import { saveModuleChoices } from '@/lib/modules/server';
import { paymentSettings } from '@/lib/checkout/settings';
import { changeStatus, getOrderById, markOrderPaid } from '@/lib/checkout/orders';
import { storeSettings } from '@/lib/store/settings';
import { adjustStock, claimDownload, downloadsFor, expireUnpaidOrders, placeStoreOrder, priceBasket, releaseOrderStock, syncVariants, type PlaceStoreInput } from '@/lib/store/engine';
import { HttpError } from '@/lib/http/errors';

const run = Boolean(process.env.DATABASE_URL);
const tag = `p${Date.now().toString(36)}`;
const slug = (s: string) => `${tag}-${s}`;
const mail = (s: string) => `${tag}.${s}@store.test`;
const address = { name: 'Sam', line1: '1 High St', city: 'Dhaka', country: 'BD', phone: '+8801700000000' };
const previous: Record<string, unknown> = {};
let staff = { id: '', name: 'Tester' };
const ids: Record<string, string> = {};
let shirt: { M: string; L: string };

const refuses = async (p: Promise<unknown>, text: RegExp) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, 'should have been refused').toBeInstanceOf(HttpError);
  expect((e as HttpError).message).toMatch(text);
};
const stockOf = async (variantId: string) => (await getDb().productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
const input = (patch: Partial<PlaceStoreInput> & { v: string; q?: number }): PlaceStoreInput => ({ lines: [{ v: patch.v, q: patch.q ?? 1 }], name: 'Sam', email: mail('buyer'), phone: '0170', address, shippingRateId: 'bangladesh:standard', methodId: 'bkash', ...patch });

describe.skipIf(!run)('store (database)', () => {
  beforeAll(async () => {
    const db = getDb();
    staff = { id: (await db.user.create({ data: { email: `${tag}.staff@store.test`, kind: 'STAFF', role: 'administrator', name: 'Tester' } })).id, name: 'Tester' };
    for (const key of ['payments', 'store']) previous[key] = (await db.setting.findUnique({ where: { key } }))?.data ?? null;
    previous.modules = (await db.setting.findUnique({ where: { key: 'modules' } }))?.data ?? null;
    await saveSetting(paymentSettings, {
      currency: 'USD', localCurrency: '', localRate: null, orderPrefix: 'TS', invoicePrefix: 'TSI', taxRatePct: 0, taxInclusive: false, ownerEmail: 'owner@store.test',
      methods: [{ id: 'bkash', enabled: true, label: 'bKash', details: 'Number 01700000000', testMode: true }],
    });
    await saveSetting(storeSettings, {
      ...storeSettings.defaults, holdHours: 24,
      taxClasses: [{ id: 'standard', name: 'Standard', ratePct: 10 }, { id: 'zero', name: 'Zero', ratePct: 0 }],
      taxOverrides: [{ classId: 'standard', country: 'DE', ratePct: 19 }],
      shippingTaxClass: 'standard',
      shippingRates: [
        { zone: 'Bangladesh', countries: ['BD'], name: 'Standard', kind: 'flat', price: 500, perKg: null, freeOver: 20_000 },
        { zone: 'World', countries: ['*'], name: 'Courier', kind: 'weight', price: 1000, perKg: 500, freeOver: null },
        { zone: 'Nowhere', countries: ['AD'], name: 'Pigeon', kind: 'flat', price: 100, perKg: null, freeOver: null },
      ],
    });
    await saveModuleChoices({ services: true, checkout: true, store: true });

    const mk = (name: string, extra: Record<string, unknown>) => db.storeProduct.create({ data: { name, slug: slug(name.toLowerCase().replace(/\W+/g, '-')), status: 'PUBLISHED', price: 5000, currency: 'USD', ...extra } });
    const shirtP = await mk('Shirt', { weightGrams: 300, options: [{ name: 'Size', values: ['M', 'L'] }], startStock: 0 });
    const mug = await mk('Mug', { sku: 'MUG-1', startStock: 3, weightGrams: 400, taxClass: 'zero' });
    const guide = await mk('Guide', { kind: 'digital', price: 2000, trackStock: false, downloadLimit: 2, downloadDays: 30, digitalFiles: [{ name: 'Guide PDF', url: 'https://files.example.com/guide.pdf' }] });
    const draft = await mk('Hidden', { status: 'DRAFT', startStock: 5 });
    ids.shirt = shirtP.id; ids.mug = mug.id; ids.guide = guide.id; ids.draft = draft.id;
    for (const p of [shirtP, mug, guide, draft]) await syncVariants(p.id);
    const rows = await db.productVariant.findMany({ where: { productId: shirtP.id } });
    shirt = { M: rows.find((r) => r.key === 'Size=M')!.id, L: rows.find((r) => r.key === 'Size=L')!.id };
    await adjustStock(shirt.M, 10, 'first delivery', staff);
    await adjustStock(shirt.L, 1, 'one left', staff);
  });

  afterAll(async () => {
    const db = getDb();
    await db.order.deleteMany({ where: { email: { endsWith: '@store.test' } } });
    await db.downloadGrant.deleteMany({});
    await db.storeProduct.deleteMany({ where: { slug: { startsWith: tag } } });
    await db.auditLog.deleteMany({ where: { userId: staff.id } });
    await db.user.deleteMany({ where: { email: { endsWith: '@store.test' } } });
    await db.emailLog.deleteMany({ where: { to: { endsWith: '@store.test' } } });
    for (const [key, data] of Object.entries(previous)) {
      if (data === null) await db.setting.deleteMany({ where: { key } });
      else await db.setting.update({ where: { key }, data: { data: data as object } });
    }
  });

  const variantOf = async (product: string, key = '') => (await getDb().productVariant.findFirstOrThrow({ where: { productId: ids[product], key } })).id;

  it('makes variants from options and a starting stock for a simple product', async () => {
    const db = getDb();
    expect((await db.productVariant.findMany({ where: { productId: ids.shirt }, orderBy: { order: 'asc' } })).map((v) => v.key)).toEqual(['Size=M', 'Size=L']);
    const mugVariant = await db.productVariant.findFirstOrThrow({ where: { productId: ids.mug } });
    expect(mugVariant).toMatchObject({ key: '', stock: 3, sku: 'MUG-1' });
    expect(await db.stockMovement.findFirst({ where: { variantId: mugVariant.id } })).toMatchObject({ reason: 'initial', delta: 3, balance: 3 });
  });

  it('keeps stock and switches off combinations that were removed', async () => {
    const db = getDb();
    const p = await db.storeProduct.create({ data: { name: 'Cap', slug: slug('cap'), price: 1000, options: [{ name: 'Color', values: ['Red', 'Blue'] }] } });
    await syncVariants(p.id);
    const red = await db.productVariant.findFirstOrThrow({ where: { productId: p.id, key: 'Color=Red' } });
    await adjustStock(red.id, 4, 'x', staff);
    await db.storeProduct.update({ where: { id: p.id }, data: { options: [{ name: 'Color', values: ['Red', 'Green'] }], variants: [{ key: 'Color=Red', sku: 'CAP-R', price: 1200, active: true }] } });
    const rows = await syncVariants(p.id);
    expect(rows.map((r) => r.key).sort()).toEqual(['Color=Green', 'Color=Red']);
    const after = await db.productVariant.findMany({ where: { productId: p.id } });
    expect(after.find((v) => v.key === 'Color=Red')).toMatchObject({ stock: 4, sku: 'CAP-R', price: 1200, active: true });
    expect(after.find((v) => v.key === 'Color=Blue')?.active).toBe(false);
    expect(after.find((v) => v.key === 'Color=Green')?.stock).toBe(0);
  });

  it('prices the cart from the database with tax by class and country, and shipping by country', async () => {
    const m = await variantOf('mug');
    const bd = await priceBasket({ lines: [{ v: shirt.M, q: 2 }, { v: m, q: 1 }], address, shippingRateId: 'bangladesh:standard' });
    expect(bd.problems).toEqual([]);
    expect(bd.totals).toMatchObject({ subtotal: 15_000, shipping: 500 });
    // Two shirts at 10% (1000 in all), the mug at 0%, shipping 10% of 500 (50).
    expect(bd.totals.tax).toBe(1050);
    expect(bd.totals.total).toBe(15_000 + 500 + 1050);
    const de = await priceBasket({ lines: [{ v: shirt.M, q: 1 }], address: { ...address, country: 'DE' }, shippingRateId: 'world:courier' });
    expect(de.totals.shipping).toBe(1000 + 150);
    expect(de.totals.tax).toBe(Math.round(5000 * 0.19) + Math.round(1150 * 0.19));
    const free = await priceBasket({ lines: [{ v: shirt.M, q: 4 }], address, shippingRateId: 'bangladesh:standard' });
    expect(free.totals.shipping).toBe(0);
  });

  it('lists what stops an order instead of guessing', async () => {
    const draft = await variantOf('draft');
    expect((await priceBasket({ lines: [] })).problems).toContain('Your cart is empty.');
    expect((await priceBasket({ lines: [{ v: draft, q: 1 }] })).problems.join(' ')).toMatch(/no longer available/);
    expect((await priceBasket({ lines: [{ v: shirt.L, q: 5 }], address, shippingRateId: 'bangladesh:standard' })).problems.join(' ')).toMatch(/Only 1 of Shirt \(L\) left/);
    expect((await priceBasket({ lines: [{ v: shirt.M, q: 1 }], address: { ...address, country: 'AD' } })).problems.join(' ')).toMatch(/Choose a shipping method/);
    expect((await priceBasket({ lines: [{ v: shirt.M, q: 1 }], address, shippingRateId: 'world:courier' })).problems.join(' ')).toMatch(/Choose a shipping method/);
    expect((await priceBasket({ lines: [{ v: shirt.M, q: 1 }], address: { ...address, country: 'BD' }, shippingRateId: 'nowhere:pigeon' })).problems.join(' ')).toMatch(/Choose a shipping method/);
  });

  it('sets stock aside when the order is placed and records it', async () => {
    const before = await stockOf(shirt.M);
    const order = await placeStoreOrder(input({ v: shirt.M, q: 2 }));
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', subtotal: 10_000, shipping: 500, currency: 'USD', methodId: 'bkash' });
    expect(order.tax).toBe(1050);
    expect(order.items[0]).toMatchObject({ kind: 'product', refId: shirt.M, quantity: 2, unitPrice: 5000, title: 'Shirt (M)' });
    expect((order.shippingAddress as { country: string }).country).toBe('BD');
    expect(await stockOf(shirt.M)).toBe(before - 2);
    expect(await getDb().stockMovement.findFirst({ where: { orderId: order.id } })).toMatchObject({ reason: 'sale', delta: -2, balance: before - 2 });
  });

  it('never sells the last item twice, even at the same moment', async () => {
    const results = await Promise.allSettled([placeStoreOrder(input({ v: shirt.L, email: mail('race1') })), placeStoreOrder(input({ v: shirt.L, email: mail('race2') }))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((lost.reason as HttpError).message).toMatch(/Only 1|sold out|Sold out|just sold/i);
    expect(await stockOf(shirt.L)).toBe(0);
    await refuses(placeStoreOrder(input({ v: shirt.L })), /sold out/i);
  });

  it('refuses everything the browser could tamper with', async () => {
    await refuses(placeStoreOrder(input({ v: shirt.M, address: undefined })), /address|name|street/i);
    await refuses(placeStoreOrder(input({ v: shirt.M, shippingRateId: 'made-up' })), /shipping method/i);
    await refuses(placeStoreOrder(input({ v: shirt.M, methodId: 'bitcoin' })), /not available/);
    await refuses(placeStoreOrder(input({ v: 'does-not-exist-123', q: 1 })), /no longer available/);
    await refuses(placeStoreOrder({ ...input({ v: shirt.M }), lines: [] }), /empty/);
    await refuses(placeStoreOrder(input({ v: shirt.M, address: { ...address, country: 'ZZ' } })), /country/i);
  });

  it('returns the stock when an order is cancelled, once', async () => {
    const before = await stockOf(shirt.M);
    const order = await placeStoreOrder(input({ v: shirt.M, q: 3, email: mail('cancel') }));
    expect(await stockOf(shirt.M)).toBe(before - 3);
    await changeStatus(order.id, 'CANCELLED', staff, { notify: false });
    expect(await stockOf(shirt.M)).toBe(before);
    expect(await releaseOrderStock(order.id)).toBe(0);
    expect(await stockOf(shirt.M)).toBe(before);
    expect(await getDb().stockMovement.count({ where: { orderId: order.id, reason: 'release' } })).toBe(1);
  });

  it('cancels orders nobody paid in time and puts the stock back, but not ones awaiting a check', async () => {
    const db = getDb();
    const m = await variantOf('mug');
    const before = await stockOf(m);
    const stale = await placeStoreOrder(input({ v: m, email: mail('stale') }));
    const checking = await placeStoreOrder(input({ v: m, email: mail('checking') }));
    await db.payment.create({ data: { orderId: checking.id, provider: 'bkash', status: 'submitted', amount: checking.total, currency: 'USD', reference: `TX${tag}` } });
    const fresh = await placeStoreOrder(input({ v: m, email: mail('fresh') }));
    expect(await stockOf(m)).toBe(before - 3);
    const old = new Date(Date.now() - 30 * 3_600_000);
    await db.order.updateMany({ where: { id: { in: [stale.id, checking.id] } }, data: { createdAt: old } });
    const summary = await expireUnpaidOrders(new Date());
    expect(summary.cancelled).toBeGreaterThanOrEqual(1);
    expect((await getOrderById(stale.id))?.status).toBe('CANCELLED');
    expect((await getOrderById(checking.id))?.status).toBe('PENDING_PAYMENT');
    expect((await getOrderById(fresh.id))?.status).toBe('PENDING_PAYMENT');
    expect(await stockOf(m)).toBe(before - 2);
  });

  it('completes digital orders when paid and limits downloads', async () => {
    const g = await variantOf('guide');
    const order = await placeStoreOrder({ lines: [{ v: g, q: 1 }], name: 'Ana', email: mail('digital'), phone: '', billingCountry: 'DE', methodId: 'bkash' });
    expect(order).toMatchObject({ shipping: 0, subtotal: 2000, tax: 380, total: 2380 });
    expect(order.shippingAddress).toBeNull();
    const itemId = order.items[0]!.id;

    expect(await claimDownload(order.token, itemId, 0)).toMatchObject({ ok: false, status: 403 });
    await markOrderPaid(order.id, 'test');
    expect((await getOrderById(order.id))?.status).toBe('COMPLETED');
    const full = (await getOrderById(order.id))!;
    expect(await downloadsFor(full)).toEqual([{ itemId, title: 'Guide', files: [{ index: 0, name: 'Guide PDF', used: 0, limit: 2 }] }]);

    expect(await claimDownload(order.token, itemId, 0)).toMatchObject({ ok: true, url: 'https://files.example.com/guide.pdf' });
    expect(await claimDownload(order.token, itemId, 0)).toMatchObject({ ok: true });
    expect(await claimDownload(order.token, itemId, 0)).toMatchObject({ ok: false, status: 429 });
    expect(await claimDownload(order.token, itemId, 5)).toMatchObject({ ok: false, status: 404 });
    expect(await claimDownload(order.token, 'not-an-item-id', 0)).toMatchObject({ ok: false, status: 404 });
    expect(await claimDownload('x'.repeat(43), itemId, 0)).toMatchObject({ ok: false, status: 404 });
    expect((await downloadsFor(full))[0]?.files[0]?.used).toBe(2);
  });

  it('closes downloads after the allowed days and refuses unsafe file links', async () => {
    const g = await variantOf('guide');
    const order = await placeStoreOrder({ lines: [{ v: g, q: 1 }], name: 'Ana', email: mail('expiry'), phone: '', billingCountry: 'BD', methodId: 'bkash' });
    await markOrderPaid(order.id, 'test');
    await getDb().order.update({ where: { id: order.id }, data: { paidAt: new Date(Date.now() - 40 * 86_400_000) } });
    expect(await claimDownload(order.token, order.items[0]!.id, 0)).toMatchObject({ ok: false, status: 410 });

    const bad = await placeStoreOrder({ lines: [{ v: g, q: 1 }], name: 'Ana', email: mail('badlink'), phone: '', billingCountry: 'BD', methodId: 'bkash' });
    await markOrderPaid(bad.id, 'test');
    const item = bad.items[0]!;
    for (const url of ['javascript:alert(1)', '//evil.example.com/x', 'ftp://x/y']) {
      await getDb().orderItem.update({ where: { id: item.id }, data: { snapshot: { ...(item.snapshot as object), product: { ...((item.snapshot as { product: object }).product), files: [{ name: 'x', url }] } } } });
      expect(await claimDownload(bad.token, item.id, 0), url).toMatchObject({ ok: false, status: 404 });
    }
  });

  it('refuses stock changes that would go below zero and records the rest', async () => {
    const m = await variantOf('mug');
    const now = await stockOf(m);
    await refuses(adjustStock(m, -(now + 1), 'too many', staff), /only/i);
    await refuses(adjustStock(m, 0, '', staff), /whole number/);
    expect(await adjustStock(m, -1, 'broken', staff)).toBe(now - 1);
    expect(await getDb().stockMovement.findFirst({ where: { variantId: m, reason: 'adjust' }, orderBy: { createdAt: 'desc' } })).toMatchObject({ delta: -1, note: 'broken', by: 'Tester' });
  });
});
