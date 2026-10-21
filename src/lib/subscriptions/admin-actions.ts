'use server';

import { z } from 'zod';
import { requireArea, type StaffUser } from '@/lib/auth/guards';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { addSubscriptionNote, cancelNow, createManualSubscription, getSubscriptionById, grantDays, resumeRenewing, sendRenewalInvoice, stopRenewing, type Actor } from './engine';

type Result = { ok: true; message: string; id?: string } | { ok: false; message: string; field?: string };

async function guard(): Promise<{ staff: StaffUser; actor: Actor }> {
  const staff = await requireArea('shop');
  await requireModule('subscriptions', 'admin');
  return { staff, actor: { by: staff.name || staff.email, staffId: staff.id, isStaff: true } };
}

async function run(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message, field: error.code !== 'error' ? error.code : undefined };
    if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Some values are not valid.' };
    console.error('[subscriptions] admin action failed', error);
    return { ok: false, message: 'Something went wrong on our side and nothing was changed. Try again.' };
  }
}

const id = z.string().min(1).max(100);
const note = z.string().trim().max(500);

async function load(subscriptionId: string) {
  const sub = await getSubscriptionById(id.parse(subscriptionId));
  if (!sub) throw new HttpError(404, 'This subscription no longer exists.');
  return sub;
}

export async function grantDaysAction(subscriptionId: string, days: number, text: string): Promise<Result> {
  return run(async () => {
    const { actor } = await guard();
    const sub = await grantDays(id.parse(subscriptionId), z.number().int().parse(days), actor, note.parse(text) || undefined);
    return { ok: true, message: `Done. The plan now runs until ${sub.currentPeriodEnd.toISOString().slice(0, 10)}. Any open renewal invoice was cancelled because the end date changed.` };
  });
}

export async function cancelNowAction(subscriptionId: string, text: string, notify: boolean): Promise<Result> {
  return run(async () => {
    const { actor } = await guard();
    await cancelNow(id.parse(subscriptionId), actor, note.parse(text) || undefined, notify);
    return { ok: true, message: notify ? 'The plan was ended and the customer was emailed.' : 'The plan was ended.' };
  });
}

export async function setRenewingAction(subscriptionId: string, renewing: boolean): Promise<Result> {
  return run(async () => {
    const { actor } = await guard();
    const sub = await load(subscriptionId);
    if (renewing) await resumeRenewing(sub, actor);
    else await stopRenewing(sub, actor);
    return { ok: true, message: renewing ? 'The plan will renew again.' : 'The plan will not renew. It ends on its end date and the customer was emailed.' };
  });
}

export async function sendRenewalInvoiceAction(subscriptionId: string): Promise<Result> {
  return run(async () => {
    const { actor } = await guard();
    return { ok: true, message: await sendRenewalInvoice(id.parse(subscriptionId), actor) };
  });
}

export async function addSubscriptionNoteAction(subscriptionId: string, text: string): Promise<Result> {
  return run(async () => {
    const { actor } = await guard();
    await addSubscriptionNote(id.parse(subscriptionId), z.string().trim().min(1, 'Write a note first.').max(2000).parse(text), actor);
    return { ok: true, message: 'Note added. Only staff can see it.' };
  });
}

const manualSchema = z.object({
  packageId: z.string().max(100).optional(),
  title: z.string().trim().max(160).optional(),
  period: z.string().max(10),
  /** Decimal amount as typed, for example "49.00". Empty uses the package price. */
  amount: z.string().trim().max(14).optional(),
  name: z.string().trim().min(1, 'Enter the customer’s name.').max(120),
  email: z.string().trim().max(254),
  phone: z.string().trim().max(40).optional(),
  startsAt: z.string().max(10).optional(),
  notify: z.boolean().optional(),
});

export async function createManualAction(input: unknown): Promise<Result> {
  return run(async () => {
    const { actor } = await guard();
    const data = manualSchema.parse(input);
    let amount: number | null = null;
    if (data.amount) {
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(data.amount)) throw new HttpError(422, 'Enter the price like 49 or 49.00.', 'amount');
      amount = Math.round(Number(data.amount) * 100);
    }
    let startsAt: Date | undefined;
    if (data.startsAt) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.startsAt) || Number.isNaN(Date.parse(`${data.startsAt}T00:00:00Z`))) throw new HttpError(422, 'Enter the start date as a valid date.', 'startsAt');
      startsAt = new Date(`${data.startsAt}T00:00:00Z`);
    }
    const sub = await createManualSubscription({ packageId: data.packageId || null, title: data.title, period: data.period, amount, name: data.name, email: data.email, phone: data.phone, startsAt, notify: data.notify }, actor);
    return { ok: true, message: `Subscription ${sub.number} added.`, id: sub.id };
  });
}
