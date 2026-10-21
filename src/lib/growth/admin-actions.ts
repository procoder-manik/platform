'use server';

import { z } from 'zod';
import { requireArea } from '@/lib/auth/guards';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { formatMinor } from '@/lib/checkout/money';
import { recordPayout, setAffiliateStatus } from './engine';

type Result = { ok: true; message: string } | { ok: false; message: string };

async function guard() {
  const staff = await requireArea('marketing');
  await requireModule('affiliates', 'admin');
  return { id: staff.id, name: staff.name || staff.email };
}

async function run(fn: () => Promise<string>): Promise<Result> {
  try {
    return { ok: true, message: await fn() };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Some values are not valid.' };
    console.error('[affiliates] admin action failed', error);
    return { ok: false, message: 'Something went wrong on our side and nothing was changed. Try again.' };
  }
}

const text = z.string().trim().max(200);

/** Records that everything ready for one affiliate (in one currency) was paid, and emails them. */
export async function recordPayoutAction(affiliateId: string, currency: string, method: string, reference: string, note: string, ignoreMinimum: boolean): Promise<Result> {
  return run(async () => {
    const by = await guard();
    const payout = await recordPayout(z.string().min(1).max(100).parse(affiliateId), z.string().length(3).parse(currency), by, { method: text.parse(method), reference: text.parse(reference), note: text.parse(note) }, { ignoreMinimum });
    return `Payout of ${formatMinor(payout.amount, payout.currency)} recorded and the affiliate was emailed. This records the payout: the money itself must be sent by you.`;
  });
}

export async function setAffiliateStatusAction(affiliateId: string, status: string): Promise<Result> {
  return run(async () => {
    const by = await guard();
    await setAffiliateStatus(z.string().min(1).max(100).parse(affiliateId), z.enum(['active', 'paused']).parse(status), by);
    return status === 'active' ? 'Approved. They were emailed their link.' : 'Paused. They keep what they earned but new orders do not count.';
  });
}
