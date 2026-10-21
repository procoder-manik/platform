/**
 * Coupons, referrals and affiliates against a real database: codes at checkout for services and the shop,
 * limits and giving codes back, the referral reward, affiliate attribution, commission, hold and payouts.
 * Runs when DATABASE_URL is set.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { saveSetting } from '@/lib/settings/store';
import { saveModuleChoices } from '@/lib/modules/server';
import { paymentSettings } from '@/lib/checkout/settings';
import { changeStatus, getOrderById, markOrderPaid, placeServiceOrder, recordRefund, type PlaceInput } from '@/lib/checkout/orders';
import { storeSettings } from '@/lib/store/settings';
import { placeStoreOrder, priceBasket, syncVariants, adjustStock, type PlaceStoreInput } from '@/lib/store/engine';
import { affiliateSettings, referralSettings } from '@/lib/growth/settings';
import { applyAsAffiliate, attributeAffiliate, commissionTotals, recordPayout, releaseDiscount, resolveDiscount, runGrowthCycle, setAffiliateStatus, trackClick } from '@/lib/growth/engine';
import { HttpError } from '@/lib/http/errors';

const run = Boolean(process.env.DATABASE_URL);
const tag = `g${Date.now().toString(36)}`.toUpperCase();
const slug = (s: string) => `${tag.toLowerCase()}-${s}`;
const mail = (s: string) => `${tag.toLowerCase()}.${s}@growth.test`;
const staff = { id: '', name: 'Tester' };
const previous: Record<string, unknown> = {};
const address = { name: 'Sam', line1: '1 High St', city: 'Dhaka', country: 'BD', phone: '+8801700000000' };
let shirt = '';
let mug = '';
const day = 86_400_000;

const service = (patch: Partial<PlaceInput> = {}): PlaceInput => ({ packageSlug: slug('pro'), name: 'Sam', email: mail('buyer'), phone: '0170', requirements: {}, methodId: 'bkash', ...patch });
const shop = (patch: Partial<PlaceStoreInput> & { lines: PlaceStoreInput['lines'] }): PlaceStoreInput => ({ name: 'Sam', email: mail('shopper'), phone: '0170', address, shippingRateId: 'bd:standard', methodId: 'bkash', ...patch });
const refuses = async (p: Promise<unknown>, text: RegExp) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e, 'should have been refused').toBeInstanceOf(HttpError);
  expect((e as HttpError).message).toMatch(text);
};
const makeCoupon = (code: string, data: Record<string, unknown> = {}) => getDb().coupon.create({ data: { code: `${tag}-${code}`, kind: 'percent', percent: 20, ...data } });
const c = (code: string) => `${tag}-${code}`;
const used = async (code: string) => (await getDb().coupon.findUniqueOrThrow({ where: { code: c(code) } })).usedCount;

describe.skipIf(!run)('coupons, referrals and affiliates (database)', () => {
  beforeAll(async () => {
    const db = getDb();
    staff.id = (await db.user.create({ data: { email: mail('staff'), kind: 'STAFF', role: 'administrator', name: 'Tester' } })).id;
    for (const key of ['payments', 'store', 'referrals', 'affiliates', 'modules']) previous[key] = (await db.setting.findUnique({ where: { key } }))?.data ?? null;
    await saveSetting(paymentSettings, { currency: 'USD', localCurrency: '', localRate: null, orderPrefix: 'TS', invoicePrefix: 'TSI', taxRatePct: 10, taxInclusive: false, ownerEmail: 'owner@growth.test', methods: [{ id: 'bkash', enabled: true, label: 'bKash', details: 'Number 01700000000', testMode: true }] });
    await saveSetting(storeSettings, { ...storeSettings.defaults, taxClasses: [{ id: 'standard', name: 'Standard', ratePct: 10 }, { id: 'zero', name: 'Zero', ratePct: 0 }], shippingTaxClass: '', shippingRates: [{ zone: 'BD', countries: ['BD'], name: 'Standard', kind: 'flat', price: 1000, perKg: null, freeOver: null }] });
    await saveSetting(referralSettings, { ...referralSettings.defaults, friendKind: 'percent', friendPercent: 10, rewardAmount: 500, rewardValidDays: 30, codePrefix: 'FR' });
    await saveSetting(affiliateSettings, { ...affiliateSettings.defaults, defaultPct: 10, holdDays: 7, minPayout: 1000, autoApprove: false });
    await saveModuleChoices({ services: true, checkout: true, store: true, coupons: true, referrals: true, affiliates: true });

    const svc = await db.service.create({ data: { name: 'Care', slug: slug('svc'), active: true } });
    await db.package.create({ data: { serviceId: svc.id, name: 'Pro', slug: slug('pro'), price: 10_000, currency: 'USD', features: [] } });
    const mk = (name: string, price: number, taxClass: string) => db.storeProduct.create({ data: { name, slug: slug(name.toLowerCase()), status: 'PUBLISHED', price, currency: 'USD', startStock: 50, taxClass } });
    const [s, m] = await Promise.all([mk('Shirt', 6000, 'standard'), mk('Mug', 4000, 'zero')]);
    await syncVariants(s.id);
    await syncVariants(m.id);
    shirt = (await db.productVariant.findFirstOrThrow({ where: { productId: s.id } })).id;
    mug = (await db.productVariant.findFirstOrThrow({ where: { productId: m.id } })).id;
    void adjustStock;
    // The store rate id is made from its zone and name.
    await saveSetting(storeSettings, { ...storeSettings.defaults, taxClasses: [{ id: 'standard', name: 'Standard', ratePct: 10 }, { id: 'zero', name: 'Zero', ratePct: 0 }], shippingTaxClass: '', shippingRates: [{ zone: 'BD', countries: ['BD'], name: 'Standard', kind: 'flat', price: 1000, perKg: null, freeOver: null }] });
  });

  afterAll(async () => {
    const db = getDb();
    await db.order.deleteMany({ where: { email: { endsWith: '@growth.test' } } });
    await db.coupon.deleteMany({ where: { OR: [{ code: { startsWith: tag } }, { ownerEmail: { endsWith: '@growth.test' } }] } });
    await db.referral.deleteMany({ where: { OR: [{ friendEmail: { endsWith: '@growth.test' } }, { referrerEmail: { endsWith: '@growth.test' } }] } });
    await db.referralCode.deleteMany({ where: { email: { endsWith: '@growth.test' } } });
    await db.affiliate.deleteMany({ where: { email: { endsWith: '@growth.test' } } });
    await db.storeProduct.deleteMany({ where: { slug: { startsWith: tag.toLowerCase() } } });
    await db.package.deleteMany({ where: { slug: { startsWith: tag.toLowerCase() } } });
    await db.service.deleteMany({ where: { slug: { startsWith: tag.toLowerCase() } } });
    await db.auditLog.deleteMany({ where: { userId: staff.id } });
    await db.user.deleteMany({ where: { email: { endsWith: '@growth.test' } } });
    await db.emailLog.deleteMany({ where: { to: { endsWith: '@growth.test' } } });
    for (const [key, data] of Object.entries(previous)) {
      if (data === null) await db.setting.deleteMany({ where: { key } });
      else await db.setting.update({ where: { key }, data: { data: data as object } });
    }
  });

  // ---------- coupons ----------

  it('takes a coupon off a service order before tax and counts the use', async () => {
    await makeCoupon('TWENTY');
    const o = await placeServiceOrder(service({ code: c('twenty').toLowerCase() }));
    expect(o).toMatchObject({ subtotal: 10_000, discount: 2000, tax: 800, total: 8800 });
    expect(await used('TWENTY')).toBe(1);
    expect(await getDb().couponRedemption.findUnique({ where: { orderId: o.id } })).toMatchObject({ amount: 2000, email: mail('buyer') });
    expect(JSON.stringify(o.history)).toContain('with code');
  });

  it('refuses a code with the reason', async () => {
    const db = getDb();
    await makeCoupon('OFF', { active: false });
    await makeCoupon('FUTURE', { startsAt: new Date(Date.now() + day) });
    await makeCoupon('OLD', { endsAt: new Date(Date.now() - day) });
    await makeCoupon('SHOP', { scope: 'products' });
    await makeCoupon('BIG', { minSubtotal: 50_000 });
    await makeCoupon('MINE', { ownerEmail: mail('someone') });
    await makeCoupon('SHIPFREE', { kind: 'free_shipping', percent: null });
    for (const [code, text] of [['OFF', /not active/], ['FUTURE', /not valid yet/], ['OLD', /expired/], ['SHOP', /shop products/], ['BIG', /minimum/], ['MINE', /someone else/], ['SHIPFREE', /shipping/]] as const) {
      await refuses(placeServiceOrder(service({ code: c(code) })), text);
    }
    await refuses(placeServiceOrder(service({ code: 'nope-nope' })), /not valid/);
    await refuses(placeServiceOrder(service({ code: '!!' })), /not valid/);
    expect(await db.couponRedemption.count({ where: { email: mail('buyer'), code: { in: ['OFF', 'FUTURE'].map(c) } } })).toBe(0);
  });

  it('limits uses per customer and for everyone, and a first-order code stops after a paid order', async () => {
    await makeCoupon('ONCE', { perCustomerLimit: 1 });
    await placeServiceOrder(service({ code: c('once'), email: mail('once1') }));
    await refuses(placeServiceOrder(service({ code: c('once'), email: mail('once1') })), /already used/);
    await placeServiceOrder(service({ code: c('once'), email: mail('once2') }));

    await makeCoupon('FIRST', { firstOrderOnly: true });
    const earlier = await placeServiceOrder(service({ email: mail('returning') }));
    await placeServiceOrder(service({ code: c('first'), email: mail('returning') })).then((o) => o, () => null);
    await markOrderPaid(earlier.id, 'test');
    await refuses(placeServiceOrder(service({ code: c('first'), email: mail('returning') })), /first orders/);
    await placeServiceOrder(service({ code: c('first'), email: mail('brandnew') }));
  });

  it('never gives the last use to two orders at once', async () => {
    await makeCoupon('LAST', { usageLimit: 1 });
    const results = await Promise.allSettled([placeServiceOrder(service({ code: c('last'), email: mail('r1') })), placeServiceOrder(service({ code: c('last'), email: mail('r2') }))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.message).toMatch(/used up|just been used/);
    expect(await used('LAST')).toBe(1);
  });

  it('gives a code back when the order is cancelled, once', async () => {
    await makeCoupon('GIVE', { usageLimit: 1 });
    const o = await placeServiceOrder(service({ code: c('give'), email: mail('give') }));
    expect(await used('GIVE')).toBe(1);
    await refuses(placeServiceOrder(service({ code: c('give'), email: mail('give2') })), /used up/);
    await changeStatus(o.id, 'CANCELLED', staff, { notify: false });
    expect(await used('GIVE')).toBe(0);
    expect(await releaseDiscount(o.id)).toBe(false);
    expect(await used('GIVE')).toBe(0);
    await placeServiceOrder(service({ code: c('give'), email: mail('give3') }));
    expect(await used('GIVE')).toBe(1);
  });

  it('cancels unpaid discounted orders after the hold so a limited code is not stuck', async () => {
    const db = getDb();
    await makeCoupon('STUCK', { usageLimit: 1 });
    const o = await placeServiceOrder(service({ code: c('stuck'), email: mail('stuck') }));
    await db.couponRedemption.update({ where: { orderId: o.id }, data: { createdAt: new Date(Date.now() - 5 * day) } });
    const summary = await runGrowthCycle(new Date());
    expect(summary.cancelled).toBeGreaterThanOrEqual(1);
    expect((await getOrderById(o.id))?.status).toBe('CANCELLED');
    expect(await used('STUCK')).toBe(0);
  });

  it('applies a coupon in the shop: shared across lines so tax follows, and free shipping', async () => {
    await makeCoupon('SHOP25', { percent: 25, scope: 'products' });
    const lines = [{ v: shirt, q: 1 }, { v: mug, q: 1 }];
    const basket = await priceBasket({ lines, address, shippingRateId: 'bd:standard', code: c('shop25'), email: mail('shopper') });
    expect(basket.problems).toEqual([]);
    // 10000 subtotal, 2500 off shared 1500 / 1000; the shirt pays tax at 10% on 4500.
    expect(basket.totals).toMatchObject({ subtotal: 10_000, discount: 2500, shipping: 1000, tax: 450, total: 7500 + 1000 + 450 });
    expect(basket.discount).toMatchObject({ amount: 2500, freeShipping: false });

    await makeCoupon('SHIP0', { kind: 'free_shipping', percent: null, scope: 'products' });
    const free = await priceBasket({ lines, address, shippingRateId: 'bd:standard', code: c('ship0'), email: mail('shopper') });
    expect(free.totals).toMatchObject({ discount: 0, shipping: 0 });
    expect(free.discount).toMatchObject({ amount: 1000, freeShipping: true });

    const order = await placeStoreOrder(shop({ lines, code: c('shop25') }));
    expect(order).toMatchObject({ subtotal: 10_000, discount: 2500, tax: 450, total: 8950 });
    expect(await used('SHOP25')).toBe(1);
    await refuses(placeStoreOrder({ ...shop({ lines, email: mail('x') }), code: 'bogus-code' }), /not valid/);
  });

  it('returns the code when a store order is cancelled, along with the stock', async () => {
    await makeCoupon('SHOPONE', { percent: 10, usageLimit: 1, scope: 'products' });
    const o = await placeStoreOrder(shop({ lines: [{ v: shirt, q: 1 }], code: c('shopone'), email: mail('so') }));
    expect(await used('SHOPONE')).toBe(1);
    await changeStatus(o.id, 'CANCELLED', staff, { notify: false });
    expect(await used('SHOPONE')).toBe(0);
  });

  // ---------- referrals ----------

  it('gives a customer a code after their first paid order and rewards them when a friend pays', async () => {
    const db = getDb();
    const mine = await placeServiceOrder(service({ email: mail('ann') }));
    await markOrderPaid(mine.id, 'test');
    const code = await db.referralCode.findUniqueOrThrow({ where: { email: mail('ann') } });
    expect(code.code).toMatch(/^FR-[A-Z2-9]{6}$/);
    expect(await db.emailLog.count({ where: { to: mail('ann'), template: 'referral.invite' } })).toBe(1);
    // A second paid order does not make a second code.
    const again = await placeServiceOrder(service({ email: mail('ann') }));
    await markOrderPaid(again.id, 'test');
    expect(await db.referralCode.count({ where: { email: mail('ann') } })).toBe(1);

    await refuses(placeServiceOrder(service({ email: mail('ann'), code: code.code })), /own referral code/);
    const friend = await placeServiceOrder(service({ email: mail('ben'), code: code.code.toLowerCase() }));
    expect(friend).toMatchObject({ discount: 1000, referrerId: code.id });
    const referral = await db.referral.findUniqueOrThrow({ where: { orderId: friend.id } });
    expect(referral).toMatchObject({ status: 'pending', referrerEmail: mail('ann'), friendEmail: mail('ben'), discount: 1000 });
    await refuses(placeServiceOrder(service({ email: mail('ben'), code: code.code })), /already used/);

    await markOrderPaid(friend.id, 'test');
    const done = await db.referral.findUniqueOrThrow({ where: { id: referral.id } });
    expect(done.status).toBe('rewarded');
    const reward = await db.coupon.findUniqueOrThrow({ where: { id: done.rewardCouponId as string } });
    expect(reward).toMatchObject({ kind: 'fixed', amount: 500, usageLimit: 1, ownerEmail: mail('ann'), origin: 'referral', active: true });
    expect(reward.code).toMatch(/^REWARD-/);
    expect(await db.emailLog.count({ where: { to: mail('ann'), template: 'referral.reward' } })).toBe(1);

    // Only the referrer can use the reward.
    await refuses(placeServiceOrder(service({ email: mail('eve'), code: reward.code })), /someone else/);
    const spent = await placeServiceOrder(service({ email: mail('ann'), code: reward.code }));
    expect(spent.discount).toBe(500);
    // The friend became a customer and has their own code too.
    expect(await db.referralCode.count({ where: { email: mail('ben') } })).toBe(1);
  });

  it('refuses referral codes to people who ordered before, and takes the reward back on a full refund', async () => {
    const db = getDb();
    const owner = await placeServiceOrder(service({ email: mail('cat') }));
    await markOrderPaid(owner.id, 'test');
    const code = (await db.referralCode.findUniqueOrThrow({ where: { email: mail('cat') } })).code;

    const old = await placeServiceOrder(service({ email: mail('dan') }));
    await markOrderPaid(old.id, 'test');
    await refuses(placeServiceOrder(service({ email: mail('dan'), code })), /first order/);
    expect((await resolveDiscount(code, { email: '', scope: 'services', currency: 'USD', subtotal: 10_000 }))).toMatchObject({ ok: false, message: expect.stringMatching(/email/i) });

    const friend = await placeServiceOrder(service({ email: mail('fay'), code }));
    await markOrderPaid(friend.id, 'test');
    const referral = await db.referral.findUniqueOrThrow({ where: { orderId: friend.id } });
    expect(referral.status).toBe('rewarded');
    await recordRefund(friend.id, friend.total, { id: staff.id, name: 'Tester' });
    const after = await db.referral.findUniqueOrThrow({ where: { id: referral.id } });
    expect(after.status).toBe('void');
    expect((await db.coupon.findUniqueOrThrow({ where: { id: referral.rewardCouponId as string } })).active).toBe(false);
  });

  it('voids a pending referral when the order is cancelled', async () => {
    const db = getDb();
    const owner = await placeServiceOrder(service({ email: mail('gus') }));
    await markOrderPaid(owner.id, 'test');
    const code = (await db.referralCode.findUniqueOrThrow({ where: { email: mail('gus') } })).code;
    const friend = await placeServiceOrder(service({ email: mail('hal'), code }));
    await changeStatus(friend.id, 'CANCELLED', staff, { notify: false });
    expect((await db.referral.findUniqueOrThrow({ where: { orderId: friend.id } })).status).toBe('void');
    // The friend can try again with the code.
    expect((await placeServiceOrder(service({ email: mail('hal'), code }))).discount).toBe(1000);
  });

  // ---------- affiliates ----------

  it('takes applications, needs approval, and only credits active affiliates', async () => {
    const db = getDb();
    const applied = await applyAsAffiliate({ name: 'Zed Zebra', email: mail('zed'), website: 'https://zed.example' });
    expect(applied.status).toBe('pending');
    const a = await db.affiliate.findUniqueOrThrow({ where: { email: mail('zed') } });
    expect(a.code).toMatch(/^[A-Z0-9]{3,32}$/);
    await refuses(applyAsAffiliate({ name: 'Zed', email: mail('zed') }), /already applied/);
    await refuses(applyAsAffiliate({ name: '', email: mail('x1') }), /name/);
    await refuses(applyAsAffiliate({ name: 'A', email: 'nope' }), /valid email/);
    expect(await attributeAffiliate(a.code, mail('buyer'))).toBeNull();
    expect(await trackClick('affiliate', a.code)).toBe(false);

    await setAffiliateStatus(a.id, 'active', staff);
    expect(await db.emailLog.count({ where: { to: mail('zed'), template: 'affiliate.approved' } })).toBe(1);
    expect(await attributeAffiliate(a.code.toLowerCase(), mail('buyer'))).toBe(a.id);
    expect(await attributeAffiliate(a.code, mail('zed'))).toBeNull();
    expect(await attributeAffiliate('NOSUCH', mail('buyer'))).toBeNull();
    expect(await attributeAffiliate(undefined, mail('buyer'))).toBeNull();
    expect(await trackClick('affiliate', a.code)).toBe(true);
    expect((await db.affiliate.findUniqueOrThrow({ where: { id: a.id } })).clicks).toBe(1);
  });

  it('earns commission on what was paid after discounts, holds it, then pays it out once', async () => {
    const db = getDb();
    const a = await db.affiliate.create({ data: { name: 'Pia Pro', email: mail('pia'), code: `PIA${tag}`.slice(0, 20), token: `tok-${tag}-pia-0123456789012345678901234567890`, status: 'active' } });
    await makeCoupon('AFF20', { percent: 20 });
    const o = await placeServiceOrder(service({ email: mail('c1'), code: c('aff20'), affiliateCode: a.code }));
    expect(o.affiliateId).toBe(a.id);
    await markOrderPaid(o.id, 'test');
    const commission = await db.commission.findUniqueOrThrow({ where: { orderId: o.id } });
    // 10000 less 2000 = 8000, at the default 10%.
    expect(commission).toMatchObject({ base: 8000, rate: 10, amount: 800, status: 'pending', currency: 'USD' });
    expect(commission.approveAt.getTime()).toBeGreaterThan(Date.now() + 6 * day);

    await runGrowthCycle(new Date());
    expect((await db.commission.findUniqueOrThrow({ where: { id: commission.id } })).status).toBe('pending');
    const second = await placeServiceOrder(service({ email: mail('c2'), affiliateCode: a.code }));
    await markOrderPaid(second.id, 'test');
    expect((await runGrowthCycle(new Date(Date.now() + 8 * day))).approved).toBeGreaterThanOrEqual(2);
    expect(await commissionTotals(a.id)).toEqual([{ currency: 'USD', pending: 0, approved: 800 + 1000, paid: 0 }]);

    const payout = await recordPayout(a.id, 'USD', staff, { method: 'bank' });
    expect(payout.amount).toBe(1800);
    expect(await commissionTotals(a.id)).toEqual([{ currency: 'USD', pending: 0, approved: 0, paid: 1800 }]);
  });

  it('pays out in one transaction, never twice, and notes a refund that comes after', async () => {
    const db = getDb();
    const a = await db.affiliate.create({ data: { name: 'Quin Quick', email: mail('quin'), code: `QUIN${tag}`.slice(0, 20), token: `tok-${tag}-quin-012345678901234567890123456789`, status: 'active', commissionPct: 20 } });
    const o1 = await placeServiceOrder(service({ email: mail('q1'), affiliateCode: a.code }));
    const o2 = await placeServiceOrder(service({ email: mail('q2'), affiliateCode: a.code }));
    await markOrderPaid(o1.id, 'test');
    await markOrderPaid(o2.id, 'test');
    expect((await db.commission.findUniqueOrThrow({ where: { orderId: o1.id } })).amount).toBe(2000);
    await runGrowthCycle(new Date(Date.now() + 8 * day));

    const payout = await recordPayout(a.id, 'USD', staff, { method: 'bKash', reference: 'TX123' });
    expect(payout).toMatchObject({ amount: 4000, currency: 'USD', method: 'bKash' });
    expect(await db.commission.count({ where: { payoutId: payout.id, status: 'paid' } })).toBe(2);
    await refuses(recordPayout(a.id, 'USD', staff, {}), /Nothing is ready/);
    expect(await db.emailLog.count({ where: { to: mail('quin'), template: 'affiliate.payout' } })).toBe(1);

    await recordRefund(o1.id, o1.total, { id: staff.id, name: 'Tester' });
    const after = await db.commission.findUniqueOrThrow({ where: { orderId: o1.id } });
    expect(after.status).toBe('paid');
    expect(after.note).toMatch(/refunded after this was paid/);
  });

  it('cancels commission on a refund before it was ready, and respects the smallest payout', async () => {
    const db = getDb();
    const a = await db.affiliate.create({ data: { name: 'Rae Small', email: mail('rae'), code: `RAE${tag}`.slice(0, 20), token: `tok-${tag}-rae-0123456789012345678901234567890`, status: 'active', commissionPct: 1 } });
    const o = await placeServiceOrder(service({ email: mail('r3'), affiliateCode: a.code }));
    await markOrderPaid(o.id, 'test');
    await recordRefund(o.id, o.total, { id: staff.id, name: 'Tester' });
    expect((await db.commission.findUniqueOrThrow({ where: { orderId: o.id } })).status).toBe('void');

    const o2 = await placeServiceOrder(service({ email: mail('r4'), affiliateCode: a.code }));
    await markOrderPaid(o2.id, 'test');
    await runGrowthCycle(new Date(Date.now() + 8 * day));
    await refuses(recordPayout(a.id, 'USD', staff, {}), /below the smallest payout/);
    // 1% of the 10000 the customer paid for the service, without tax.
    expect((await recordPayout(a.id, 'USD', staff, {}, { ignoreMinimum: true })).amount).toBe(100);
  });

  it('pays no commission to a paused affiliate, on their own order, or on a shop order without the cookie', async () => {
    const db = getDb();
    const a = await db.affiliate.create({ data: { name: 'Sol Sleep', email: mail('sol'), code: `SOL${tag}`.slice(0, 20), token: `tok-${tag}-sol-0123456789012345678901234567890`, status: 'active' } });
    const own = await placeServiceOrder(service({ email: mail('sol'), affiliateCode: a.code }));
    expect(own.affiliateId).toBeNull();
    await db.affiliate.update({ where: { id: a.id }, data: { status: 'paused' } });
    const late = await placeServiceOrder(service({ email: mail('s1'), affiliateCode: a.code }));
    expect(late.affiliateId).toBeNull();
    await markOrderPaid(late.id, 'test');
    expect(await db.commission.count({ where: { affiliateId: a.id } })).toBe(0);

    await db.affiliate.update({ where: { id: a.id }, data: { status: 'active' } });
    const shopOrder = await placeStoreOrder(shop({ lines: [{ v: shirt, q: 1 }], email: mail('s2'), affiliateCode: a.code }));
    expect(shopOrder.affiliateId).toBe(a.id);
    await markOrderPaid(shopOrder.id, 'test');
    // Commission is on products only: 6000 at 10%, not on shipping or tax.
    expect((await db.commission.findUniqueOrThrow({ where: { orderId: shopOrder.id } })).amount).toBe(600);
  });
});
