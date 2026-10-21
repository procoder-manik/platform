import { describe, expect, it } from 'vitest';
import { allowedPeriods, computeTotals, quantityFor, quoteFor, yearlyPriceOf, type PackagePricing } from '@/lib/checkout/pricing';
import { ORDER_STATUSES, PAYABLE, STATUS_LABEL, TRANSITIONS, canMove } from '@/lib/checkout/status';
import { convertMinor, formatMinor, toDecimal } from '@/lib/checkout/money';
import { checkRequirements, orderNumber } from '@/lib/checkout/orders';
import { METHODS } from '@/lib/checkout/methods';
import { renderEmail, emailBrand } from '@/lib/mail/render';
import { EMAIL_TEMPLATES, PLACEHOLDERS, fill, unknownPlaceholders } from '@/lib/mail/templates';
import { brandSettings } from '@/lib/theme/brand';

const pkg = (patch: Partial<PackagePricing> = {}): PackagePricing => ({ price: 10_000, priceMax: null, billing: 'ONE_TIME', monthlyYearly: false, yearlyDiscountPct: 0, yearlyPrice: null, ...patch });

describe('package pricing', () => {
  it('allows only the periods that fit the billing', () => {
    expect(allowedPeriods(pkg())).toEqual(['once']);
    expect(allowedPeriods(pkg({ billing: 'MONTHLY' }))).toEqual(['monthly']);
    expect(allowedPeriods(pkg({ billing: 'MONTHLY', monthlyYearly: true }))).toEqual(['monthly', 'yearly']);
    expect(allowedPeriods(pkg({ billing: 'YEARLY' }))).toEqual(['yearly']);
    expect(allowedPeriods(pkg({ billing: 'HOURLY' }))).toEqual(['hourly']);
  });

  it('works out yearly as monthly x 12 minus the percent, and a fixed price wins', () => {
    expect(yearlyPriceOf({ price: 1000, yearlyDiscountPct: 20, yearlyPrice: null })).toBe(9600);
    expect(yearlyPriceOf({ price: 1000, yearlyDiscountPct: 20, yearlyPrice: 9000 })).toBe(9000);
    expect(yearlyPriceOf({ price: 999, yearlyDiscountPct: 0, yearlyPrice: null })).toBe(11_988);
    expect(yearlyPriceOf({ price: 1000, yearlyDiscountPct: 250, yearlyPrice: null })).toBe(0);
  });

  it('shows the saving and the effective monthly cost', () => {
    const q = quoteFor(pkg({ billing: 'MONTHLY', price: 1000, monthlyYearly: true, yearlyDiscountPct: 20 }), 'yearly');
    expect(q).toMatchObject({ period: 'yearly', unit: 9600, effectiveMonthly: 800, saving: { amount: 2400, pct: 20 } });
    expect(quoteFor(pkg({ billing: 'MONTHLY', price: 1000, monthlyYearly: true, yearlyDiscountPct: 20 }), 'monthly')).toMatchObject({ unit: 1000, saving: null });
    expect(quoteFor(pkg({ billing: 'MONTHLY', price: 1000, monthlyYearly: true, yearlyPrice: 12_000 }), 'yearly').saving).toBeNull();
  });

  it('rejects a period the package does not offer', () => {
    expect(() => quoteFor(pkg({ billing: 'MONTHLY' }), 'yearly')).toThrow(/cannot be bought/);
    expect(() => quoteFor(pkg(), 'monthly')).toThrow();
    expect(() => quoteFor(pkg(), 'weekly')).toThrow();
    expect(quoteFor(pkg()).period).toBe('once');
  });

  it('never charges the top of a range', () => {
    expect(quoteFor(pkg({ price: 5000, priceMax: 9000 })).unit).toBe(5000);
    expect(quoteFor(pkg({ price: 5000, priceMax: 9000 })).unitMax).toBe(9000);
    expect(quoteFor(pkg({ price: 5000, priceMax: 4000 })).unitMax).toBeNull();
  });

  it('limits quantity to hourly packages and to a sane range', () => {
    expect(quantityFor('ONE_TIME', 50)).toBe(1);
    expect(quantityFor('HOURLY', 5)).toBe(5);
    expect(quantityFor('HOURLY', -3)).toBe(1);
    expect(quantityFor('HOURLY', 'abc')).toBe(1);
    expect(quantityFor('HOURLY', 99_999)).toBe(1000);
    expect(quantityFor('HOURLY', 2.9)).toBe(2);
  });
});

describe('totals and tax', () => {
  it('adds exclusive tax on top', () => {
    expect(computeTotals({ subtotal: 10_000, taxRatePct: 15, taxInclusive: false })).toEqual({ subtotal: 10_000, discount: 0, shipping: 0, tax: 1500, total: 11_500 });
  });
  it('extracts inclusive tax from the price', () => {
    expect(computeTotals({ subtotal: 11_500, taxRatePct: 15, taxInclusive: true })).toMatchObject({ tax: 1500, total: 11_500 });
  });
  it('has no tax at zero and never goes negative', () => {
    expect(computeTotals({ subtotal: 5000, taxRatePct: 0, taxInclusive: false }).total).toBe(5000);
    expect(computeTotals({ subtotal: 5000, discount: 9000, taxRatePct: 10, taxInclusive: false }).total).toBe(0);
  });
  it('rounds to whole cents', () => {
    const t = computeTotals({ subtotal: 3333, taxRatePct: 7.5, taxInclusive: false });
    expect(Number.isInteger(t.tax) && Number.isInteger(t.total)).toBe(true);
  });
});

describe('money', () => {
  it('formats decimals for gateways and people', () => {
    expect(toDecimal(1234)).toBe('12.34');
    expect(toDecimal(5)).toBe('0.05');
    expect(toDecimal(-250)).toBe('-2.50');
    expect(formatMinor(123_456, 'USD')).toBe('$1,234.56');
    expect(convertMinor(10_000, 122.5)).toBe(1_225_000);
  });
});

describe('order status', () => {
  it('has a label and a path for every status, and no status moves to itself', () => {
    for (const s of ORDER_STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(TRANSITIONS[s]).not.toContain(s);
      for (const t of TRANSITIONS[s]) expect(ORDER_STATUSES).toContain(t);
    }
  });
  it('ends at cancelled and refunded, and only pays from a payable state', () => {
    expect(TRANSITIONS.CANCELLED).toEqual([]);
    expect(TRANSITIONS.REFUNDED).toEqual([]);
    for (const s of ORDER_STATUSES) if (canMove(s, 'PAID')) expect([...PAYABLE, 'VERIFYING']).toContain(s);
    expect(canMove('COMPLETED', 'PENDING_PAYMENT')).toBe(false);
    expect(canMove('PAID', 'REFUNDED')).toBe(true);
  });
});

describe('order numbers and checkout questions', () => {
  it('looks like PREFIX-YYMMDD-XXXX with no confusing characters', () => {
    const n = orderNumber('WL', new Date('2026-10-19T10:00:00Z'));
    expect(n).toMatch(/^WL-261019-[A-HJ-NP-Z2-9]{4}$/);
    expect(new Set(Array.from({ length: 500 }, () => orderNumber('WL'))).size).toBeGreaterThan(490);
  });
  it('requires answers, checks choices and drops unknown answers', () => {
    const defs = [{ label: 'Site', kind: 'text', required: true }, { label: 'Size', kind: 'select', options: ['S', 'M'] }];
    expect(() => checkRequirements(defs, {})).toThrow(/Site/);
    expect(() => checkRequirements(defs, { Site: 'x', Size: 'XL' })).toThrow(/Size/);
    expect(checkRequirements(defs, { Site: ' example.com ', Extra: 'ignored' })).toEqual([{ label: 'Site', value: 'example.com' }]);
  });
});

describe('payment methods', () => {
  it('lists the nine methods the spec asks for', () => {
    expect(METHODS.map((m) => m.id)).toEqual(['stripe', 'paypal', 'sslcommerz', 'bkash', 'nagad', 'rocket', 'bank', 'wise', 'payoneer']);
    expect(METHODS.filter((m) => m.kind === 'manual').every((m) => m.proof)).toBe(true);
  });
});

describe('emails', () => {
  const brand = emailBrand(brandSettings.defaults, 'Northlight', 'https://example.com');
  it('fills placeholders, escapes values and always includes plain text', () => {
    const out = renderEmail(EMAIL_TEMPLATES['order.paid'], { name: '<b>Sam</b>', number: 'WL-1', package: 'Pro', total: '$10.00', link: 'https://example.com/order/x', invoice_link: 'https://example.com/invoice/x' }, brand);
    expect(out.subject).toBe('Payment confirmed for order WL-1');
    expect(out.html).toContain('&lt;b&gt;Sam&lt;/b&gt;');
    expect(out.html).not.toContain('<b>Sam</b>');
    expect(out.html).toContain('View your order');
    expect(out.text).toContain('View your order: https://example.com/order/x');
    // Plain text is not HTML: the name stays as typed, and none of the layout's markup leaks in.
    expect(out.text).toContain('Hi <b>Sam</b>,');
    expect(out.text).not.toMatch(/&lt;|&amp;|<p|<table|<a /);
  });
  it('leaves unknown placeholders visible so they can be caught', () => {
    expect(fill('Hi {name} {oops}', { name: 'Sam' })).toBe('Hi Sam {oops}');
    expect(unknownPlaceholders('{name} {oops} {total}')).toEqual(['oops']);
  });
  it('only uses placeholders it knows', () => {
    for (const t of Object.values(EMAIL_TEMPLATES)) expect(unknownPlaceholders(`${t.subject} ${t.body}`)).toEqual([]);
    expect(PLACEHOLDERS).toContain('invoice_link');
  });
});
