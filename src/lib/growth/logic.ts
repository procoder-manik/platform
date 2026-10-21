/**
 * Rules for coupons, referrals and affiliate commission that need no database: code format, whether a
 * coupon applies, how much it takes off, how a discount is shared across lines, and commission amounts.
 * Pure and shared so the cart, the checkout and the admin agree. Amounts are integers in minor units.
 */
import { randomBytes } from 'node:crypto';

export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** "  summer 10 " is not a code; "summer10" becomes "SUMMER10". Returns null when it cannot be one. */
export function normalizeCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random, easy to read code such as FRIEND-K7QX2M. */
export function randomCode(prefix: string, length = 6): string {
  const bytes = randomBytes(length);
  return `${prefix}${[...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('')}`;
}

export type CouponKind = 'percent' | 'fixed' | 'free_shipping';
export type CouponScope = 'all' | 'services' | 'products';

export interface CouponRules {
  kind: string;
  percent: number | null;
  amount: number | null;
  scope: string;
  minSubtotal: number | null;
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  active: boolean;
  usedCount: number;
  ownerEmail: string | null;
}

export interface CouponContext {
  email: string;
  /** Where the order comes from: a service package or shop products. */
  scope: 'services' | 'products';
  subtotal: number;
  now: Date;
  /** How many times this email already used the coupon (orders still standing). */
  usedByEmail: number;
  /** The email has a paid order already. */
  hasPriorOrder: boolean;
}

/** A plain-words reason the coupon cannot be used, or null when it can. */
export function couponProblem(c: CouponRules, ctx: CouponContext): string | null {
  if (!c.active) return 'This code is not active.';
  if (c.startsAt && c.startsAt.getTime() > ctx.now.getTime()) return 'This code is not valid yet.';
  if (c.endsAt && c.endsAt.getTime() <= ctx.now.getTime()) return 'This code has expired.';
  if (c.ownerEmail && c.ownerEmail.toLowerCase() !== ctx.email.toLowerCase()) return 'This code belongs to someone else.';
  if (c.scope === 'services' && ctx.scope !== 'services') return 'This code is only for services.';
  if (c.scope === 'products' && ctx.scope !== 'products') return 'This code is only for shop products.';
  if (c.kind === 'free_shipping' && ctx.scope !== 'products') return 'This code takes off shipping, which only shop orders have.';
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return 'This code has been used up.';
  if (c.perCustomerLimit !== null && ctx.usedByEmail >= c.perCustomerLimit) return c.perCustomerLimit === 1 ? 'You have already used this code.' : `You can use this code ${c.perCustomerLimit} times and you have reached that.`;
  if (c.firstOrderOnly && ctx.hasPriorOrder) return 'This code is for first orders only.';
  if (c.minSubtotal !== null && ctx.subtotal < c.minSubtotal) return 'Your order is below the minimum for this code.';
  return null;
}

/** What the coupon takes off the products or services (never more than they cost). Free shipping takes off no product money. */
export function couponDiscount(c: Pick<CouponRules, 'kind' | 'percent' | 'amount' | 'maxDiscount'>, subtotal: number): { discount: number; freeShipping: boolean } {
  if (c.kind === 'free_shipping') return { discount: 0, freeShipping: true };
  let discount = 0;
  if (c.kind === 'percent') discount = Math.round((subtotal * Math.min(100, Math.max(0, c.percent ?? 0))) / 100);
  else if (c.kind === 'fixed') discount = Math.max(0, c.amount ?? 0);
  if (c.maxDiscount !== null && c.maxDiscount > 0) discount = Math.min(discount, c.maxDiscount);
  return { discount: Math.min(discount, Math.max(0, subtotal)), freeShipping: false };
}

/** Shares a discount across lines in proportion to their price. The last line takes the rounding left over. */
export function allocateDiscount(amounts: readonly number[], discount: number): number[] {
  const total = amounts.reduce((n, a) => n + a, 0);
  if (total <= 0 || discount <= 0) return amounts.map(() => 0);
  const capped = Math.min(discount, total);
  let given = 0;
  return amounts.map((a, i) => {
    if (i === amounts.length - 1) return capped - given;
    const share = Math.floor((a * capped) / total);
    given += share;
    return share;
  });
}

/** Commission on a base amount at a percentage, rounded to a whole minor unit. */
export const commissionFor = (base: number, ratePct: number): number => Math.max(0, Math.round((Math.max(0, base) * Math.max(0, ratePct)) / 100));

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

/** Short text for the discount on a coupon, shown in lists and messages. */
export function describeCoupon(c: Pick<CouponRules, 'kind' | 'percent' | 'amount'>, format: (minor: number) => string): string {
  if (c.kind === 'percent') return `${c.percent ?? 0}% off`;
  if (c.kind === 'fixed') return `${format(c.amount ?? 0)} off`;
  return 'Free shipping';
}

export const COMMISSION_STATUS_LABEL: Record<string, string> = { pending: 'Waiting', approved: 'Ready to pay', paid: 'Paid', void: 'Cancelled' };
