/**
 * Package pricing. Pure and shared: the pricing page, the checkout form and the server all call these,
 * and the server always recomputes from database values, so the browser can never set a price.
 */
export type BillingKind = 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'HOURLY';
export type Period = 'once' | 'monthly' | 'yearly' | 'hourly';

export interface PackagePricing {
  price: number;
  priceMax: number | null;
  billing: BillingKind;
  monthlyYearly: boolean;
  yearlyDiscountPct: number;
  yearlyPrice: number | null;
}

export const PERIOD_LABEL: Record<Period, string> = { once: 'one time', monthly: 'per month', yearly: 'per year', hourly: 'per hour' };

export function allowedPeriods(p: Pick<PackagePricing, 'billing' | 'monthlyYearly'>): Period[] {
  switch (p.billing) {
    case 'MONTHLY':
      return p.monthlyYearly ? ['monthly', 'yearly'] : ['monthly'];
    case 'YEARLY':
      return ['yearly'];
    case 'HOURLY':
      return ['hourly'];
    default:
      return ['once'];
  }
}

/** Yearly price of a monthly plan: a fixed yearly price wins, else monthly x 12 minus the discount percent. */
export function yearlyPriceOf(p: Pick<PackagePricing, 'price' | 'yearlyDiscountPct' | 'yearlyPrice'>): number {
  if (p.yearlyPrice !== null && p.yearlyPrice > 0) return p.yearlyPrice;
  const pct = Math.min(100, Math.max(0, p.yearlyDiscountPct));
  return Math.round((p.price * 12 * (100 - pct)) / 100);
}

export interface PriceQuote {
  period: Period;
  /** Price of one unit for the chosen period, in minor units. */
  unit: number;
  /** Top of a range, when the package shows "from X to Y". Never charged. */
  unitMax: number | null;
  /** What it costs per month when billed yearly. */
  effectiveMonthly: number | null;
  /** "You save" against paying monthly for a year. */
  saving: { amount: number; pct: number } | null;
}

/** Throws a plain message when the period is not allowed for the package. */
export function quoteFor(p: PackagePricing, requested?: string | null): PriceQuote {
  const periods = allowedPeriods(p);
  const period = (requested ? (periods.find((x) => x === requested) as Period | undefined) : periods[0]) as Period | undefined;
  if (!period) throw new Error(`This package cannot be bought ${requested ? `"${requested}"` : 'this way'}. Choose ${periods.join(' or ')}.`);

  if (p.billing === 'MONTHLY' && period === 'yearly') {
    const unit = yearlyPriceOf(p);
    const full = p.price * 12;
    const amount = Math.max(0, full - unit);
    return { period, unit, unitMax: null, effectiveMonthly: Math.round(unit / 12), saving: amount > 0 ? { amount, pct: Math.round((amount / full) * 100) } : null };
  }
  return {
    period,
    unit: p.price,
    unitMax: p.priceMax && p.priceMax > p.price ? p.priceMax : null,
    effectiveMonthly: p.billing === 'YEARLY' ? Math.round(p.price / 12) : null,
    saving: null,
  };
}

/** Quantity is only used for hourly packages (hours). */
export function quantityFor(billing: BillingKind, requested: unknown): number {
  if (billing !== 'HOURLY') return 1;
  const n = Math.floor(Number(requested));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(1000, n);
}

export interface Totals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

/** Tax is a flat percent for now (Settings > Payments). Inclusive prices already contain the tax. */
export function computeTotals(input: { subtotal: number; discount?: number; shipping?: number; taxRatePct: number; taxInclusive: boolean }): Totals {
  const discount = Math.min(input.discount ?? 0, input.subtotal);
  const shipping = input.shipping ?? 0;
  const taxable = input.subtotal - discount + (input.taxInclusive ? 0 : 0);
  const rate = Math.max(0, input.taxRatePct) / 100;
  const tax = rate === 0 ? 0 : input.taxInclusive ? Math.round(taxable - taxable / (1 + rate)) : Math.round(taxable * rate);
  const total = input.taxInclusive ? taxable + shipping : taxable + shipping + tax;
  return { subtotal: input.subtotal, discount, shipping, tax, total };
}
