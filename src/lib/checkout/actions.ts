'use server';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { GatewayError } from '@/lib/adapters/payments/types';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { baseUrl } from '@/lib/url';
import { getOrderByToken, placeServiceOrder, signProofUpload, startPayment, submitManualPayment, sendOrderEmail } from './orders';
import { getDb } from '@/lib/db';
import { quantityFor, quoteFor, type PackagePricing } from './pricing';
import { resolveDiscount } from '@/lib/growth/engine';
import { currentCustomerId } from '@/lib/accounts/current';

export type CheckoutResult = { ok: true; redirect: string } | { ok: false; message: string; errors: Record<string, string> };

async function clientIp(): Promise<string> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function fail(error: unknown): CheckoutResult {
  if (error instanceof HttpError) return { ok: false, message: error.message, errors: error.code && error.code !== 'error' ? { [error.code]: error.message } : {} };
  if (error instanceof GatewayError) {
    console.error('[checkout] gateway error:', error.message);
    return { ok: false, message: 'The payment provider is not answering right now. Please try another method or try again in a minute.', errors: {} };
  }
  if (error instanceof z.ZodError) {
    if (error.issues.some((i) => i.code === 'unrecognized_keys')) return { ok: false, message: 'This request contains values that only the shop can set, such as prices. It was not accepted.', errors: {} };
    return { ok: false, message: 'Some fields need attention.', errors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? 'form'), i.message])) };
  }
  console.error('[checkout] unexpected error', error);
  return { ok: false, message: 'Something went wrong on our side and no payment was taken. Please try again.', errors: {} };
}

/** Only these fields can come from the browser. Anything else, a price or a total for example, is refused outright. */
const placeSchema = z
  .object({
    package: z.string().min(1).max(80),
    period: z.string().max(10).optional(),
    quantity: z.number().int().min(1).max(1000).optional(),
    name: z.string().trim().min(1, 'Enter your name.').max(120),
    email: z.email('Enter a valid email address.').max(254),
    phone: z.string().trim().max(40).optional().default(''),
    requirements: z.record(z.string().max(100), z.string().max(2000)).optional().default({}),
    method: z.string().min(1, 'Choose a payment method.').max(20),
    code: z.string().max(40).optional(),
    acceptTerms: z.boolean().optional(),
    website: z.string().max(200).optional(),
  })
  .strict();

/** Places an order and starts payment. Returns where to send the buyer. */
export async function placeOrderAction(input: unknown): Promise<CheckoutResult> {
  try {
    await requireModule('checkout');
    const data = placeSchema.parse(input);
    // Bots fill the hidden field. Pretend it worked so they learn nothing.
    if (data.website) return { ok: true, redirect: '/' };
    const ip = await clientIp();
    const [byIp, byEmail] = await Promise.all([rateLimit(`order:ip:${ip}`, { max: 12, windowMs: 3_600_000 }), rateLimit(`order:email:${data.email.toLowerCase()}`, { max: 6, windowMs: 3_600_000 })]);
    if (!byIp.ok || !byEmail.ok) throw new HttpError(429, 'Too many orders from this connection. Please try again later.');

    const order = await placeServiceOrder({ packageSlug: data.package, period: data.period, quantity: data.quantity, name: data.name, email: data.email, phone: data.phone, requirements: data.requirements, methodId: data.method, acceptTerms: data.acceptTerms, code: data.code, affiliateCode: (await cookies()).get('aff')?.value, userId: await currentCustomerId() });
    await sendOrderEmail(order, 'order.received');
    const base = await baseUrl();
    try {
      const start = await startPayment(order, data.method);
      return { ok: true, redirect: start.kind === 'redirect' ? start.url : `${base}/order/${order.token}` };
    } catch (error) {
      // The order exists; the buyer can pick another method from their order page.
      console.error('[checkout] could not start payment for', order.number, error);
      return { ok: true, redirect: `${base}/order/${order.token}?error=gateway` };
    }
  } catch (error) {
    return fail(error);
  }
}

/** Pay, or try again, from the private order page. */
export async function payOrderAction(token: string, methodId: string): Promise<CheckoutResult> {
  try {
    await requireModule('checkout');
    const order = await getOrderByToken(z.string().min(20).max(80).parse(token));
    if (!order) throw new HttpError(404, 'This order was not found.');
    if (!(await rateLimit(`pay:${order.id}`, { max: 10, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many attempts. Please try again later.');
    const start = await startPayment(order, z.string().max(20).parse(methodId));
    return { ok: true, redirect: start.kind === 'redirect' ? start.url : `${await baseUrl()}/order/${order.token}` };
  } catch (error) {
    return fail(error);
  }
}

const proofSchema = z.object({
  transactionId: z.string().max(64).optional(),
  senderNumber: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  proof: z.object({ key: z.string().min(1).max(500), mime: z.string().max(100), size: z.number().int().positive().max(5_242_880) }).optional(),
});

/** The buyer says they paid by a manual method. */
export async function submitPaymentAction(token: string, input: unknown): Promise<CheckoutResult> {
  try {
    await requireModule('checkout');
    const order = await getOrderByToken(z.string().min(20).max(80).parse(token));
    if (!order) throw new HttpError(404, 'This order was not found.');
    if (!(await rateLimit(`proofsubmit:${order.id}`, { max: 8, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many attempts. Please try again later.');
    await submitManualPayment(order, proofSchema.parse(input));
    return { ok: true, redirect: `${await baseUrl()}/order/${order.token}?sent=1` };
  } catch (error) {
    return fail(error);
  }
}

/** A short-lived upload address for a receipt. */
export async function signProofAction(token: string, mime: string, size: number): Promise<{ ok: true; upload: Awaited<ReturnType<typeof signProofUpload>> } | { ok: false; message: string }> {
  try {
    await requireModule('checkout');
    const order = await getOrderByToken(z.string().min(20).max(80).parse(token));
    if (!order) throw new HttpError(404, 'This order was not found.');
    return { ok: true, upload: await signProofUpload(order, z.string().max(100).parse(mime), z.number().int().parse(size)) };
  } catch (error) {
    const f = fail(error);
    return { ok: false, message: f.ok ? 'Upload failed.' : f.message };
  }
}

export async function orderStatusAction(token: string): Promise<{ status: string } | null> {
  const row = await getDb().order.findUnique({ where: { token }, select: { id: true, status: true } });
  if (!row) return null;
  return { status: row.status };
}

/** What a code would take off one package, for the live total on the checkout form. Nothing is counted yet. */
export async function previewCodeAction(input: unknown): Promise<{ ok: true; discount: number; label: string } | { ok: false; message: string }> {
  try {
    await requireModule('checkout');
    const data = z.object({ package: z.string().min(1).max(80), period: z.string().max(10).optional(), quantity: z.number().int().min(1).max(1000).optional(), code: z.string().max(40), email: z.string().max(254).optional() }).strict().parse(input);
    const pkg = await getDb().package.findFirst({ where: { slug: data.package, active: true, service: { active: true } } });
    if (!pkg) throw new HttpError(404, 'This package is not available any more.');
    const quote = quoteFor(pkg as PackagePricing, data.period);
    const subtotal = quote.unit * quantityFor(pkg.billing, data.quantity);
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!(await rateLimit(`code:${ip}`, { max: 30, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many tries. Please wait a little and try again.');
    const found = await resolveDiscount(data.code, { email: data.email ?? '', scope: 'services', currency: pkg.currency, subtotal });
    if (!found.ok) return { ok: false, message: found.message };
    return { ok: true, discount: found.discount, label: found.label };
  } catch (error) {
    const r = fail(error);
    return { ok: false, message: r.ok ? 'That did not work.' : r.message };
  }
}
