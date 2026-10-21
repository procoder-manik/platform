import { describe, expect, it } from 'vitest';
import { allocateDiscount, commissionFor, couponDiscount, couponProblem, describeCoupon, normalizeCode, randomCode, type CouponContext, type CouponRules } from '@/lib/growth/logic';
import { affiliateSettings, referralSettings } from '@/lib/growth/settings';
import { couponsResource, couponUsesResource } from '@/modules/coupons/resources';
import { referralsResource } from '@/modules/referrals/resources';
import { affiliatesResource } from '@/modules/affiliates/resources';
import { manifest as affiliates } from '@/modules/affiliates/manifest';
import { manifest as referrals } from '@/modules/referrals/manifest';
import { routeMatches } from '@/lib/modules/logic';
import { walkFields } from '@/lib/admin/fields';
import { EMAIL_TEMPLATES, unknownPlaceholders } from '@/lib/mail/templates';

const now = new Date('2026-10-20T12:00:00Z');
const coupon = (patch: Partial<CouponRules> = {}): CouponRules => ({ kind: 'percent', percent: 20, amount: null, scope: 'all', minSubtotal: null, maxDiscount: null, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: null, firstOrderOnly: false, active: true, usedCount: 0, ownerEmail: null, ...patch });
const ctx = (patch: Partial<CouponContext> = {}): CouponContext => ({ email: 'a@b.test', scope: 'services', subtotal: 10_000, now, usedByEmail: 0, hasPriorOrder: false, ...patch });

describe('codes', () => {
  it('normalises what buyers type', () => {
    expect(normalizeCode(' summer10 ')).toBe('SUMMER10');
    expect(normalizeCode('Friend-k7qx2m')).toBe('FRIEND-K7QX2M');
    for (const bad of ['', 'ab', 'has space', 'bad!', '-start', 'x'.repeat(40), null, undefined]) expect(normalizeCode(bad), String(bad)).toBeNull();
  });
  it('makes readable random codes that pass the format', () => {
    const a = randomCode('REWARD-');
    expect(a).toMatch(/^REWARD-[A-Z2-9]{6}$/);
    expect(normalizeCode(a)).toBe(a);
    expect(randomCode('')).not.toBe(randomCode(''));
  });
});

describe('couponProblem', () => {
  it('lets a plain coupon through', () => expect(couponProblem(coupon(), ctx())).toBeNull());
  it('explains each reason in plain words', () => {
    expect(couponProblem(coupon({ active: false }), ctx())).toMatch(/not active/);
    expect(couponProblem(coupon({ startsAt: new Date('2026-11-01') }), ctx())).toMatch(/not valid yet/);
    expect(couponProblem(coupon({ endsAt: new Date('2026-10-20T12:00:00Z') }), ctx())).toMatch(/expired/);
    expect(couponProblem(coupon({ endsAt: new Date('2026-10-20T12:00:01Z') }), ctx())).toBeNull();
    expect(couponProblem(coupon({ ownerEmail: 'x@y.test' }), ctx())).toMatch(/someone else/);
    expect(couponProblem(coupon({ ownerEmail: 'A@B.test' }), ctx())).toBeNull();
    expect(couponProblem(coupon({ scope: 'products' }), ctx({ scope: 'services' }))).toMatch(/shop products/);
    expect(couponProblem(coupon({ scope: 'services' }), ctx({ scope: 'products' }))).toMatch(/services/);
    expect(couponProblem(coupon({ kind: 'free_shipping' }), ctx({ scope: 'services' }))).toMatch(/shipping/);
    expect(couponProblem(coupon({ usageLimit: 5, usedCount: 5 }), ctx())).toMatch(/used up/);
    expect(couponProblem(coupon({ usageLimit: 5, usedCount: 4 }), ctx())).toBeNull();
    expect(couponProblem(coupon({ perCustomerLimit: 1 }), ctx({ usedByEmail: 1 }))).toMatch(/already used/);
    expect(couponProblem(coupon({ perCustomerLimit: 3 }), ctx({ usedByEmail: 3 }))).toMatch(/3 times/);
    expect(couponProblem(coupon({ firstOrderOnly: true }), ctx({ hasPriorOrder: true }))).toMatch(/first orders/);
    expect(couponProblem(coupon({ minSubtotal: 10_001 }), ctx())).toMatch(/minimum/);
    expect(couponProblem(coupon({ minSubtotal: 10_000 }), ctx())).toBeNull();
  });
});

describe('couponDiscount', () => {
  it('takes a percentage, with an optional cap', () => {
    expect(couponDiscount(coupon(), 10_000)).toEqual({ discount: 2000, freeShipping: false });
    expect(couponDiscount(coupon({ maxDiscount: 1500 }), 10_000).discount).toBe(1500);
    expect(couponDiscount(coupon({ percent: 100 }), 999).discount).toBe(999);
  });
  it('takes a fixed amount but never more than the order', () => {
    expect(couponDiscount(coupon({ kind: 'fixed', amount: 500 }), 10_000).discount).toBe(500);
    expect(couponDiscount(coupon({ kind: 'fixed', amount: 50_000 }), 10_000).discount).toBe(10_000);
    expect(couponDiscount(coupon({ kind: 'fixed', amount: null }), 10_000).discount).toBe(0);
  });
  it('free shipping takes nothing off the products', () => expect(couponDiscount(coupon({ kind: 'free_shipping' }), 10_000)).toEqual({ discount: 0, freeShipping: true }));
  it('describes itself', () => {
    expect(describeCoupon(coupon(), String)).toBe('20% off');
    expect(describeCoupon(coupon({ kind: 'fixed', amount: 500 }), (n) => `$${n / 100}`)).toBe('$5 off');
    expect(describeCoupon(coupon({ kind: 'free_shipping' }), String)).toBe('Free shipping');
  });
});

describe('allocateDiscount', () => {
  it('shares in proportion and always adds up exactly', () => {
    expect(allocateDiscount([5000, 5000], 1000)).toEqual([500, 500]);
    const parts = allocateDiscount([3333, 3333, 3334], 1000);
    expect(parts.reduce((n, p) => n + p, 0)).toBe(1000);
    expect(allocateDiscount([100, 900], 100)).toEqual([10, 90]);
  });
  it('caps at the total and handles nothing to share', () => {
    expect(allocateDiscount([300, 700], 5000)).toEqual([300, 700]);
    expect(allocateDiscount([100, 100], 0)).toEqual([0, 0]);
    expect(allocateDiscount([], 100)).toEqual([]);
    expect(allocateDiscount([0, 0], 100)).toEqual([0, 0]);
  });
});

describe('commissionFor', () => {
  it('rounds to a whole minor unit and never goes negative', () => {
    expect(commissionFor(10_000, 10)).toBe(1000);
    expect(commissionFor(3333, 7.5)).toBe(250);
    expect(commissionFor(-500, 10)).toBe(0);
    expect(commissionFor(1000, 0)).toBe(0);
  });
});

describe('settings, resources and wiring', () => {
  it('accepts the defaults and refuses nonsense', () => {
    expect(referralSettings.schema.safeParse(referralSettings.defaults).success).toBe(true);
    expect(affiliateSettings.schema.safeParse(affiliateSettings.defaults).success).toBe(true);
    for (const patch of [{ friendPercent: 0 }, { rewardValidDays: 0 }, { codePrefix: 'lower' }, { friendKind: 'free' }]) expect(referralSettings.schema.safeParse({ ...referralSettings.defaults, ...patch }).success, JSON.stringify(patch)).toBe(false);
    for (const patch of [{ defaultPct: 120 }, { cookieDays: 0 }, { holdDays: -1 }, { title: '' }]) expect(affiliateSettings.schema.safeParse({ ...affiliateSettings.defaults, ...patch }).success, JSON.stringify(patch)).toBe(false);
  });
  it('declares a field for every setting', () => {
    expect(referralSettings.fields.map((f) => f.name).sort()).toEqual(Object.keys(referralSettings.defaults).sort());
    expect(affiliateSettings.fields.map((f) => f.name).sort()).toEqual(Object.keys(affiliateSettings.defaults).sort());
  });
  it('gives every field help text', () => {
    for (const def of [couponsResource, couponUsesResource, referralsResource, affiliatesResource]) for (const { field, path } of walkFields(def.fields)) expect(field.info.length, `${def.id}.${path}`).toBeGreaterThan(10);
  });
  it('owns its addresses and no others', () => {
    for (const p of ['/a', '/a/CODE', '/affiliate/tok', '/affiliates']) expect(affiliates.routes.some((r) => routeMatches(r, p)), p).toBe(true);
    for (const p of ['/about', '/admin/affiliates', '/api/cron/growth']) expect(affiliates.routes.some((r) => routeMatches(r, p)), p).toBe(false);
    expect(referrals.routes.some((r) => routeMatches(r, '/ref/FRIEND-ABC123'))).toBe(true);
    expect(referrals.routes.some((r) => routeMatches(r, '/reference'))).toBe(false);
  });
  it('no longer needs the accounts module, which does not exist yet', () => {
    expect(affiliates.requires).toEqual([['checkout']]);
    expect(referrals.requires).toEqual([['checkout']]);
  });
  it('emails only use placeholders that exist', () => {
    const ids = Object.keys(EMAIL_TEMPLATES).filter((k) => k.startsWith('referral.') || k.startsWith('affiliate.') || k === 'owner.affiliate');
    expect(ids.length).toBe(7);
    for (const id of ids) {
      const t = EMAIL_TEMPLATES[id as keyof typeof EMAIL_TEMPLATES];
      expect(unknownPlaceholders(`${t.subject} ${t.body}`), id).toEqual([]);
    }
  });
});
