import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysUntil, nextTerm, parseReminderDays, planCycle, reminderKey, type CycleConfig, type CycleInput } from '@/lib/subscriptions/schedule';
import { subscriptionSettings } from '@/lib/subscriptions/settings';
import { EMAIL_TEMPLATES, PLACEHOLDERS, unknownPlaceholders } from '@/lib/mail/templates';
import { subscriptionsResource } from '@/modules/subscriptions/resources';
import { manifest } from '@/modules/subscriptions/manifest';
import { routeMatches } from '@/lib/modules/logic';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const cfg: CycleConfig = { leadDays: 7, reminderDays: [7, 3, 1], graceDays: 3 };
const base: CycleInput = { status: 'ACTIVE', currentPeriodEnd: d('2026-11-30'), cancelAtPeriodEnd: false, hasOpenRenewal: false, remindersSent: [] };

describe('addMonths', () => {
  it('adds calendar months', () => {
    expect(iso(addMonths(d('2026-01-15'), 1))).toBe('2026-02-15');
    expect(iso(addMonths(d('2026-01-15'), 12))).toBe('2027-01-15');
    expect(iso(addMonths(d('2026-11-20'), 3))).toBe('2027-02-20');
  });
  it('lands on the last day of a shorter month and keeps the anchor day', () => {
    expect(iso(addMonths(d('2026-01-31'), 1, 31))).toBe('2026-02-28');
    expect(iso(addMonths(d('2026-02-28'), 1, 31))).toBe('2026-03-31');
    expect(iso(addMonths(d('2026-03-31'), 1, 31))).toBe('2026-04-30');
    expect(iso(addMonths(d('2027-02-28'), 12, 29))).toBe('2028-02-29');
  });
  it('handles leap years and year ends', () => {
    expect(iso(addMonths(d('2028-01-31'), 1, 31))).toBe('2028-02-29');
    expect(iso(addMonths(d('2026-12-15'), 1))).toBe('2027-01-15');
    expect(iso(addMonths(d('2026-12-31'), 2, 31))).toBe('2027-02-28');
  });
  it('keeps the time of day', () => {
    expect(addMonths(new Date('2026-05-10T14:30:00.000Z'), 1).toISOString()).toBe('2026-06-10T14:30:00.000Z');
  });
});

describe('days', () => {
  it('counts whole days rounded up', () => {
    expect(daysUntil(d('2026-11-10'), d('2026-11-03'))).toBe(7);
    expect(daysUntil(new Date('2026-11-10T01:00:00Z'), d('2026-11-03'))).toBe(8);
    expect(daysUntil(d('2026-11-03'), d('2026-11-03'))).toBe(0);
  });
  it('adds days', () => expect(iso(addDays(d('2026-11-30'), 3))).toBe('2026-12-03'));
});

describe('nextTerm', () => {
  const input = { currentEnd: d('2026-11-30'), period: 'monthly' as const, anchorDay: 31, now: d('2026-11-25') };
  it('continues from the end of the current term when paid early', () => {
    const t = nextTerm({ ...input, status: 'ACTIVE' });
    expect([iso(t.start), iso(t.end), t.kind]).toEqual(['2026-11-30', '2026-12-31', 'renewal']);
  });
  it('continues from the old end when paid inside the grace period, so no days are lost', () => {
    const t = nextTerm({ ...input, status: 'PAST_DUE', now: d('2026-12-02') });
    expect([iso(t.start), iso(t.end), t.kind]).toEqual(['2026-11-30', '2026-12-31', 'renewal']);
  });
  it('starts fresh today after the plan expired', () => {
    const t = nextTerm({ ...input, status: 'EXPIRED', now: d('2027-01-10') });
    expect([iso(t.start), iso(t.end), t.kind]).toEqual(['2027-01-10', '2027-02-10', 'restart']);
  });
  it('adds a year for yearly plans', () => {
    const t = nextTerm({ currentEnd: d('2027-02-28'), status: 'ACTIVE', period: 'yearly', anchorDay: 29, now: d('2027-02-20') });
    expect(iso(t.end)).toBe('2028-02-29');
  });
});

describe('parseReminderDays', () => {
  it('parses, sorts and removes duplicates', () => {
    expect(parseReminderDays('7, 3, 1')).toEqual([7, 3, 1]);
    expect(parseReminderDays('1,3,7,3')).toEqual([7, 3, 1]);
    expect(parseReminderDays('')).toEqual([]);
    expect(parseReminderDays('  14 ')).toEqual([14]);
  });
  it('refuses anything else', () => {
    for (const bad of ['7 3 1', 'a', '0', '61', '7,', '1.5', '-3', '7;3']) expect(parseReminderDays(bad), bad).toBeNull();
  });
});

describe('planCycle', () => {
  const plan = (patch: Partial<CycleInput>, now: string) => planCycle({ ...base, ...patch }, d(now), cfg);

  it('does nothing long before the end', () => {
    const p = plan({}, '2026-11-01');
    expect(p.createRenewal).toBe(false);
    expect(p.remind).toBeNull();
    expect(p.covered).toEqual([]);
  });
  it('creates the renewal invoice when the lead time starts and counts it as the first reminder', () => {
    const p = plan({}, '2026-11-23');
    expect(p.createRenewal).toBe(true);
    expect(p.remind).toBeNull();
    expect(p.covered).toEqual([7]);
  });
  it('catches up when the job missed days: one invoice, older reminders marked covered', () => {
    const p = plan({}, '2026-11-28');
    expect(p.createRenewal).toBe(true);
    expect(p.covered).toEqual([7, 3]);
  });
  it('sends the 3 day reminder once, then not again', () => {
    const open = { hasOpenRenewal: true, remindersSent: [reminderKey(d('2026-11-30'), 7)] };
    const first = plan(open, '2026-11-27');
    expect(first.remind).toBe(3);
    expect(first.createRenewal).toBe(false);
    const again = plan({ ...open, remindersSent: [...open.remindersSent, reminderKey(d('2026-11-30'), 3)] }, '2026-11-27');
    expect(again.remind).toBeNull();
  });
  it('sends only the nearest reminder when several are due', () => {
    const p = plan({ hasOpenRenewal: true }, '2026-11-29');
    expect(p.remind).toBe(1);
    expect(p.covered).toEqual([7, 3, 1]);
  });
  it('never reminds without an invoice to pay', () => {
    expect(plan({ hasOpenRenewal: false, remindersSent: [] }, '2026-11-01').remind).toBeNull();
  });
  it('sends nothing for a plan set not to renew', () => {
    const p = plan({ cancelAtPeriodEnd: true }, '2026-11-25');
    expect(p).toMatchObject({ createRenewal: false, remind: null });
  });
  it('ends a plan set not to renew when its end date arrives', () => {
    expect(plan({ cancelAtPeriodEnd: true }, '2026-11-30').end).toBe(true);
    expect(plan({ cancelAtPeriodEnd: true }, '2026-12-05').end).toBe(true);
  });
  it('starts the grace period when the end date passes unpaid', () => {
    const p = plan({}, '2026-11-30');
    expect(p.becomePastDue).toBe(true);
    expect(p.end).toBe(false);
  });
  it('waits through the grace period, then expires', () => {
    expect(plan({ status: 'PAST_DUE' }, '2026-12-02')).toMatchObject({ expire: false, becomePastDue: false });
    expect(plan({ status: 'PAST_DUE' }, '2026-12-03').expire).toBe(true);
  });
  it('expires at once with no grace period', () => {
    expect(planCycle({ ...base, status: 'PAST_DUE' }, d('2026-11-30'), { ...cfg, graceDays: 0 }).expire).toBe(true);
  });
  it('ignores plans that already ended', () => {
    for (const status of ['EXPIRED', 'CANCELLED'] as const) {
      expect(plan({ status }, '2027-06-01')).toMatchObject({ createRenewal: false, remind: null, becomePastDue: false, end: false, expire: false });
    }
  });
  it('a different end date means the old reminders do not count', () => {
    const sent = [reminderKey(d('2026-10-31'), 7)];
    expect(plan({ remindersSent: sent, hasOpenRenewal: true }, '2026-11-24').remind).toBe(7);
  });
});

describe('subscription settings', () => {
  const ok = { ...subscriptionSettings.defaults };
  it('accepts the defaults', () => expect(subscriptionSettings.schema.safeParse(ok).success).toBe(true));
  it('refuses unusable values with plain messages', () => {
    for (const patch of [{ reminderDays: '7 3' }, { reminderDays: '90' }, { leadDays: 0 }, { graceDays: 99 }, { numberPrefix: 'sub' }, { renewalPrice: 'free' }]) {
      expect(subscriptionSettings.schema.safeParse({ ...ok, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });
  it('declares a field for every setting', () => {
    const names = subscriptionSettings.fields.map((f) => f.name).sort();
    expect(names).toEqual(Object.keys(subscriptionSettings.defaults).sort());
  });
});

describe('module wiring', () => {
  it('owns /subscription but not /subscriptions or the admin path', () => {
    expect(manifest.routes.some((r) => routeMatches(r, '/subscription/abc'))).toBe(true);
    expect(manifest.routes.some((r) => routeMatches(r, '/subscriptions'))).toBe(false);
    expect(manifest.routes.some((r) => routeMatches(r, '/admin/subscriptions'))).toBe(false);
  });
  it('registers a daily cron job and its resource and settings', () => {
    expect(manifest.cron?.[0]?.path).toBe('/api/cron/subscriptions');
    expect(manifest.resources?.[0]?.id).toBe('subscriptions');
    expect(manifest.settings[0]?.key).toBe('subscriptions');
  });
  it('lists only columns the model has', () => {
    const real = ['number', 'email', 'title', 'status', 'currentPeriodEnd', 'amount', 'period', 'renewals', 'startedAt', 'cancelAtPeriodEnd', 'currency'];
    for (const c of subscriptionsResource.columns) expect(real).toContain(c.field);
    for (const c of subscriptionsResource.csv?.columns ?? []) expect(real).toContain(c);
  });
});

describe('subscription emails', () => {
  const ids = Object.keys(EMAIL_TEMPLATES).filter((k) => k.startsWith('subscription.') || k === 'owner.subscription');
  it('has a template for every step of the life cycle', () => {
    for (const id of ['started', 'renewal_due', 'reminder', 'renewed', 'past_due', 'expired', 'ended', 'stopped']) expect(ids).toContain(`subscription.${id}`);
    expect(ids).toContain('owner.subscription');
  });
  it('only uses placeholders that exist', () => {
    for (const id of ids) {
      const t = EMAIL_TEMPLATES[id as keyof typeof EMAIL_TEMPLATES];
      expect(unknownPlaceholders(`${t.subject} ${t.body}`), id).toEqual([]);
    }
    for (const p of ['plan', 'period', 'ends', 'days', 'manage_link']) expect(PLACEHOLDERS).toContain(p);
  });
  it('never promises an automatic charge', () => {
    const text = ids.map((id) => EMAIL_TEMPLATES[id as keyof typeof EMAIL_TEMPLATES].body).join(' ').toLowerCase();
    expect(text).not.toMatch(/will be charged|we will charge|automatically renew/);
  });
});
