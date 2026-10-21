'use server';

import { z } from 'zod';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { baseUrl } from '@/lib/url';
import { getSubscriptionByToken, renewNow, resumeRenewing, stopRenewing, type Actor } from './engine';

export type SubscriptionResult = { ok: true; redirect: string | null; message: string } | { ok: false; message: string };

const customer: Actor = { by: 'customer', isStaff: false };

async function load(token: string) {
  await requireModule('subscriptions');
  const clean = z.string().min(20).max(80).parse(token);
  const sub = await getSubscriptionByToken(clean);
  if (!sub) throw new HttpError(404, 'This plan was not found.');
  if (!(await rateLimit(`sub:${sub.id}`, { max: 20, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many attempts. Please try again later.');
  return sub;
}

function fail(error: unknown): SubscriptionResult {
  if (error instanceof HttpError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: 'This address is not valid.' };
  console.error('[subscriptions] unexpected error', error);
  return { ok: false, message: 'Something went wrong on our side and nothing was changed. Please try again.' };
}

/** The customer stops renewing. The plan keeps working to the end of the paid term. */
export async function stopRenewingAction(token: string): Promise<SubscriptionResult> {
  try {
    await stopRenewing(await load(token), customer);
    return { ok: true, redirect: null, message: 'Done. We will not renew this plan. It stays active until the end date.' };
  } catch (error) {
    return fail(error);
  }
}

/** The customer changed their mind. */
export async function resumeRenewingAction(token: string): Promise<SubscriptionResult> {
  try {
    await resumeRenewing(await load(token), customer);
    return { ok: true, redirect: null, message: 'Thank you. This plan will renew as before.' };
  } catch (error) {
    return fail(error);
  }
}

/** Renew now, or start again after the plan ended. Sends the customer to the order page to pay. */
export async function renewNowAction(token: string): Promise<SubscriptionResult> {
  try {
    const order = await renewNow(await load(token), customer);
    return { ok: true, redirect: `${await baseUrl()}/order/${order.token}`, message: 'Your invoice is ready.' };
  } catch (error) {
    return fail(error);
  }
}
