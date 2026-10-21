'use server';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { GatewayError } from '@/lib/adapters/payments/types';
import { HttpError } from '@/lib/http/errors';
import { requireModule } from '@/lib/modules/server';
import { baseUrl } from '@/lib/url';
import { currentCustomerId } from '@/lib/accounts/current';
import { sendOrderEmail, startPayment } from '@/lib/checkout/orders';
import { priceBasket, loadCartVariants, placeStoreOrder, type Basket } from './engine';
import { addToCart, parseCart, serializeCart, setQuantity, MAX_QUANTITY, type CartLine } from './logic';

const COOKIE = 'cart';

async function readCart(): Promise<CartLine[]> {
  return parseCart((await cookies()).get(COOKIE)?.value);
}

async function writeCart(lines: readonly CartLine[]): Promise<void> {
  const jar = await cookies();
  if (lines.length === 0) jar.delete(COOKIE);
  else jar.set(COOKIE, serializeCart(lines), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export type CartResult = { ok: true; count: number; message: string } | { ok: false; message: string };

const count = (lines: readonly CartLine[]) => lines.reduce((n, l) => n + l.q, 0);
const variantId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);
const quantity = z.number().int().min(0).max(MAX_QUANTITY);

function failCart(error: unknown): { ok: false; message: string } {
  if (error instanceof HttpError) return { ok: false, message: error.message };
  if (error instanceof z.ZodError) return { ok: false, message: 'That request was not valid.' };
  console.error('[store] cart action failed', error);
  return { ok: false, message: 'Something went wrong on our side. Please try again.' };
}

/** Adds an item. The price is never sent: the cart only holds which variant and how many. */
export async function addToCartAction(id: string, qty: number): Promise<CartResult> {
  try {
    await requireModule('store');
    const vid = variantId.parse(id);
    const q = quantity.min(1).parse(qty);
    const found = (await loadCartVariants([{ v: vid, q }])).get(vid);
    if (!found) throw new HttpError(404, 'This product is not available any more.');
    const lines = await readCart();
    const have = lines.find((l) => l.v === vid)?.q ?? 0;
    if (found.product.trackStock && have + q > found.stock) {
      throw new HttpError(409, found.stock <= 0 ? 'Sorry, this is sold out.' : `Only ${found.stock} in stock${have ? `, and ${have} are already in your cart` : ''}.`);
    }
    const next = addToCart(lines, vid, q);
    await writeCart(next);
    return { ok: true, count: count(next), message: 'Added to your cart.' };
  } catch (error) {
    return failCart(error);
  }
}

/** Sets a quantity. Zero removes the item. */
export async function updateCartAction(id: string, qty: number): Promise<CartResult> {
  try {
    await requireModule('store');
    const next = setQuantity(await readCart(), variantId.parse(id), quantity.parse(qty));
    await writeCart(next);
    return { ok: true, count: count(next), message: 'Cart updated.' };
  } catch (error) {
    return failCart(error);
  }
}

/** Rate limit for code tries, so codes cannot be guessed. */
async function limitCodeTries(): Promise<void> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await rateLimit(`quote:${ip}`, { max: 240, windowMs: 3_600_000 })).ok) throw new HttpError(429, 'Too many requests. Please wait a little and try again.');
}

const quoteSchema = z.object({ code: z.string().max(40).optional(), email: z.string().max(254).optional(), address: z.record(z.string().max(20), z.string().max(200)).optional(), billingCountry: z.string().max(2).optional(), shippingRateId: z.string().max(100).nullable().optional() }).strict();

/** The prices, tax and shipping options for the cart, for the live totals in checkout. */
export async function quoteAction(input: unknown): Promise<{ ok: true; basket: Basket } | { ok: false; message: string }> {
  try {
    await requireModule('store');
    const data = quoteSchema.parse(input);
    if (data.code) await limitCodeTries();
    const basket = await priceBasket({ lines: await readCart(), address: data.address, billingCountry: data.billingCountry, shippingRateId: data.shippingRateId, code: data.code, email: data.email });
    return { ok: true, basket: { ...basket, source: null } };
  } catch (error) {
    return failCart(error);
  }
}

const orderSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(120),
    email: z.email('Enter a valid email address.').max(254),
    phone: z.string().trim().max(40).optional().default(''),
    address: z.record(z.string().max(20), z.string().max(200)).optional(),
    billingCountry: z.string().max(2).optional(),
    shippingRateId: z.string().max(100).nullable().optional(),
    code: z.string().max(40).optional(),
    method: z.string().min(1, 'Choose a payment method.').max(20),
    acceptTerms: z.boolean().optional(),
    website: z.string().max(200).optional(),
  })
  .strict();

export type PlaceResult = { ok: true; redirect: string } | { ok: false; message: string; errors: Record<string, string> };

/** Places the order for the cart, sets stock aside and starts payment. Only buyer details can come from the browser. */
export async function placeStoreOrderAction(input: unknown): Promise<PlaceResult> {
  try {
    await requireModule('store');
    const data = orderSchema.parse(input);
    if (data.website) return { ok: true, redirect: '/' };
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const [byIp, byEmail] = await Promise.all([rateLimit(`order:ip:${ip}`, { max: 12, windowMs: 3_600_000 }), rateLimit(`order:email:${data.email.toLowerCase()}`, { max: 6, windowMs: 3_600_000 })]);
    if (!byIp.ok || !byEmail.ok) throw new HttpError(429, 'Too many orders from this connection. Please try again later.');

    const lines = await readCart();
    const order = await placeStoreOrder({ lines, name: data.name, email: data.email, phone: data.phone, address: data.address, billingCountry: data.billingCountry, shippingRateId: data.shippingRateId, code: data.code, affiliateCode: (await cookies()).get('aff')?.value, userId: await currentCustomerId(), methodId: data.method, acceptTerms: data.acceptTerms });
    await writeCart([]);
    await sendOrderEmail(order, 'order.received');
    const base = await baseUrl();
    try {
      const start = await startPayment(order, data.method);
      return { ok: true, redirect: start.kind === 'redirect' ? start.url : `${base}/order/${order.token}` };
    } catch (error) {
      console.error('[store] could not start payment for', order.number, error);
      return { ok: true, redirect: `${base}/order/${order.token}?error=gateway` };
    }
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message, errors: error.code && error.code !== 'error' ? { [error.code]: error.message } : {} };
    if (error instanceof GatewayError) return { ok: false, message: 'The payment provider is not answering right now. Please try another method or try again in a minute.', errors: {} };
    if (error instanceof z.ZodError) {
      if (error.issues.some((i) => i.code === 'unrecognized_keys')) return { ok: false, message: 'This request contains values that only the shop can set, such as prices. It was not accepted.', errors: {} };
      return { ok: false, message: 'Some fields need attention.', errors: Object.fromEntries(error.issues.map((i) => [String(i.path[0] ?? 'form'), i.message])) };
    }
    console.error('[store] unexpected error', error);
    return { ok: false, message: 'Something went wrong on our side and no payment was taken. Please try again.', errors: {} };
  }
}
