'use server';

import { z } from 'zod';
import { requireArea, type StaffUser } from '@/lib/auth/guards';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { addNote, addUpdate, changeStatus, getOrderById, recordRefund, sendOrderEmail, verifyPayment, type StaffRef } from './orders';
import { ORDER_STATUSES } from './status';
import { writeAudit } from '@/lib/audit';

type Result = { ok: true; message: string } | { ok: false; message: string };

async function guard(): Promise<{ staff: StaffUser; ref: StaffRef }> {
  const staff = await requireArea('shop');
  await requireModule('checkout', 'admin');
  return { staff, ref: { id: staff.id, name: staff.name || staff.email } };
}

async function run(fn: () => Promise<string>): Promise<Result> {
  try {
    return { ok: true, message: await fn() };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Some values are not valid.' };
    console.error('[orders] admin action failed', error);
    return { ok: false, message: 'Something went wrong on our side and nothing was changed. Try again.' };
  }
}

const id = z.string().min(1).max(100);

export async function changeStatusAction(orderId: string, to: string, note: string, notify: boolean): Promise<Result> {
  return run(async () => {
    const { ref } = await guard();
    const target = z.enum(ORDER_STATUSES).parse(to);
    await changeStatus(id.parse(orderId), target, ref, { note: note.trim().slice(0, 500) || undefined, notify });
    return 'Status changed.';
  });
}

export async function verifyPaymentAction(orderId: string, paymentId: string, approve: boolean, reason: string): Promise<Result> {
  return run(async () => {
    const { ref } = await guard();
    await verifyPayment(id.parse(orderId), id.parse(paymentId), approve, ref.name, reason.trim().slice(0, 500) || undefined);
    await writeAudit({ userId: ref.id, action: approve ? 'order.payment_verified' : 'order.payment_rejected', entity: 'order', entityId: orderId });
    return approve ? 'Payment confirmed. The order is paid and the customer has their receipt.' : 'Payment rejected. The customer was asked to send the details again.';
  });
}

export async function refundAction(orderId: string, amountMinor: number, reason: string): Promise<Result> {
  return run(async () => {
    const { ref } = await guard();
    await recordRefund(id.parse(orderId), z.number().int().parse(amountMinor), ref, reason.trim().slice(0, 200) || undefined);
    return 'Refund recorded. Remember to send the money back in your payment gateway or bank.';
  });
}

export async function addNoteAction(orderId: string, text: string): Promise<Result> {
  return run(async () => {
    const { ref } = await guard();
    await addNote(id.parse(orderId), z.string().trim().min(1, 'Write a note first.').max(2000).parse(text), ref);
    return 'Note added. Only staff can see it.';
  });
}

export async function addUpdateAction(orderId: string, text: string, fileUrl: string, fileName: string, notify: boolean): Promise<Result> {
  return run(async () => {
    const { ref } = await guard();
    const clean = z.object({ text: z.string().trim().min(1, 'Write the update first.').max(2000), fileUrl: z.string().max(2000).refine((v) => !v || /^(https:\/\/|\/)/.test(v), 'The file address is not valid.'), fileName: z.string().max(120) }).parse({ text, fileUrl, fileName });
    await addUpdate(id.parse(orderId), { ...clean, fileUrl: clean.fileUrl || undefined, fileName: clean.fileName || undefined, notify }, ref);
    return notify ? 'Update posted and the customer was emailed.' : 'Update posted on the order page.';
  });
}

export async function sendInvoiceAction(orderId: string): Promise<Result> {
  return run(async () => {
    const { ref } = await guard();
    const order = await getOrderById(id.parse(orderId));
    if (!order) throw new HttpError(404, 'This order no longer exists.');
    if (!order.invoiceNumber) throw new HttpError(409, 'The invoice is created when the order is paid.');
    const ok = await sendOrderEmail(order, 'order.invoice');
    await writeAudit({ userId: ref.id, action: 'order.invoice_sent', entity: 'order', entityId: orderId });
    if (!ok) throw new HttpError(502, 'The email could not be sent. Check the mail settings.');
    return `Invoice sent to ${order.email}.`;
  });
}
