/**
 * Subscription dates and the daily plan. Pure and shared, so it is unit tested without a database:
 * the cron job asks `planCycle` what to do with each subscription and then does exactly that.
 * All dates are UTC, so a term always starts and ends at the same time of day.
 */
export type SubPeriod = 'monthly' | 'yearly';
export type SubStatusId = 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED';

export const SUB_PERIODS: readonly SubPeriod[] = ['monthly', 'yearly'];
export const isSubPeriod = (v: unknown): v is SubPeriod => v === 'monthly' || v === 'yearly';
export const monthsIn = (period: SubPeriod): number => (period === 'yearly' ? 12 : 1);

const DAY_MS = 86_400_000;
const daysInMonth = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();

/**
 * Adds whole months and lands on `anchorDay`, or on the last day of a shorter month. Starting on 31 January
 * with an anchor of 31 gives 28 February, then 31 March (not 28 March), so the plan never drifts.
 */
export function addMonths(date: Date, months: number, anchorDay = date.getUTCDate()): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(Math.max(1, anchorDay), daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** Whole days from `from` to `to`, rounded up, so "ends in 3 days" stays 3 until the day is nearly over. */
export const daysUntil = (to: Date, from: Date): number => Math.ceil((to.getTime() - from.getTime()) / DAY_MS);

export interface TermPlan {
  start: Date;
  end: Date;
  /** "renewal" continues the plan; "restart" begins a new run after it fully expired. */
  kind: 'renewal' | 'restart';
}

/**
 * The next paid term. Paying on time or inside the grace period continues from the end of the current term,
 * so nobody loses days by paying late. Paying after the plan expired (or was cancelled) starts a fresh run today.
 */
export function nextTerm(input: { currentEnd: Date; status: SubStatusId; period: SubPeriod; anchorDay: number; now: Date }): TermPlan {
  const running = input.status === 'ACTIVE' || input.status === 'PAST_DUE';
  const start = running ? input.currentEnd : input.now;
  // A fresh run anchors on the day it starts, not on the day the old plan used.
  const anchor = running ? input.anchorDay : input.now.getUTCDate();
  return { start, end: addMonths(start, monthsIn(input.period), anchor), kind: running ? 'renewal' : 'restart' };
}

/** "7, 3, 1" or "7,3,1" becomes [7, 3, 1] (largest first, no duplicates, 1 to 60). Anything else gives null. */
export function parseReminderDays(text: string): number[] | null {
  const value = text.trim();
  if (value === '') return [];
  if (!/^\d{1,2}(\s*,\s*\d{1,2})*$/.test(value)) return null;
  const days = [...new Set(value.split(',').map((d) => Number(d.trim())))];
  if (days.some((d) => d < 1 || d > 60)) return null;
  return days.sort((a, b) => b - a);
}

export interface CycleConfig {
  /** Days before the end when the renewal order is created. */
  leadDays: number;
  /** Days before the end when a reminder goes out (largest first). */
  reminderDays: readonly number[];
  /** Days after the end a plan stays usable while waiting for payment. */
  graceDays: number;
}

export interface CycleInput {
  status: SubStatusId;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  /** An unpaid renewal order already exists for the current term. */
  hasOpenRenewal: boolean;
  remindersSent: readonly string[];
}

export interface CyclePlan {
  /** Create the renewal order now. */
  createRenewal: boolean;
  /** Send the reminder for this many days before the end (one at most per run, the nearest that is due). */
  remind: number | null;
  /** Reminder days that are now covered, by the reminder sent or by the renewal invoice email. Record them as sent. */
  covered: number[];
  /** The term ended without payment: grace starts. */
  becomePastDue: boolean;
  /** The term ended and the customer had asked not to renew: it ends now. */
  end: boolean;
  /** The grace period is over. */
  expire: boolean;
}

export const reminderKey = (periodEnd: Date, days: number): string => `${periodEnd.toISOString()}:${days}`;
const none: CyclePlan = { createRenewal: false, remind: null, covered: [], becomePastDue: false, end: false, expire: false };

/**
 * What to do with one subscription today. A missed cron run catches up: if three reminder days have already
 * passed, only the nearest one is sent, and the older ones are marked as covered by the caller.
 */
export function planCycle(sub: CycleInput, now: Date, cfg: CycleConfig): CyclePlan {
  if (sub.status === 'EXPIRED' || sub.status === 'CANCELLED') return none;
  const end = sub.currentPeriodEnd;

  if (now.getTime() >= end.getTime()) {
    if (sub.status === 'ACTIVE') {
      return sub.cancelAtPeriodEnd ? { ...none, end: true } : { ...none, becomePastDue: true };
    }
    // PAST_DUE: wait out the grace period.
    return now.getTime() >= addDays(end, cfg.graceDays).getTime() ? { ...none, expire: true } : none;
  }

  if (sub.status !== 'ACTIVE' || sub.cancelAtPeriodEnd) return none;
  const left = daysUntil(end, now);
  const createRenewal = !sub.hasOpenRenewal && left <= cfg.leadDays;
  const due = cfg.reminderDays.filter((d) => left <= d && !sub.remindersSent.includes(reminderKey(end, d)));
  // Reminders are only useful once there is an invoice to pay. The email that announces a new renewal
  // invoice counts as the reminder for every day that is already due, so nobody gets two emails at once.
  if (!sub.hasOpenRenewal && !createRenewal) return none;
  if (createRenewal) return { ...none, createRenewal, covered: due };
  return { ...none, remind: due.length ? Math.min(...due) : null, covered: due };
}

export const SUB_STATUS_LABEL: Record<SubStatusId, string> = { ACTIVE: 'Active', PAST_DUE: 'Payment due', EXPIRED: 'Expired', CANCELLED: 'Cancelled' };
export const SUB_STATUS_TONE: Record<SubStatusId, 'success' | 'warning' | 'danger' | 'muted'> = { ACTIVE: 'success', PAST_DUE: 'warning', EXPIRED: 'danger', CANCELLED: 'muted' };
export const SUB_PERIOD_LABEL: Record<SubPeriod, string> = { monthly: 'Monthly', yearly: 'Yearly' };
export const isSubStatus = (v: string): v is SubStatusId => v === 'ACTIVE' || v === 'PAST_DUE' || v === 'EXPIRED' || v === 'CANCELLED';
