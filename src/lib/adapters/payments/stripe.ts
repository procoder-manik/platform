import { createHmac, timingSafeEqual } from 'node:crypto';
import { GatewayError, WebhookError, type CheckoutRequest, type CheckoutStart, type Fetch, type OrderRef, type PaymentAdapter, type WebhookOutcome } from './types';

export interface StripeOptions {
  secretKey: string;
  webhookSecret: string;
  fetch?: Fetch;
  baseUrl?: string;
  /** Seconds a signed event stays valid. */
  tolerance?: number;
  now?: () => number;
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Verifies Stripe's signature header: t=timestamp,v1=hmac of "t.body". */
export function verifyStripeSignature(body: string, header: string | null, secret: string, tolerance = 300, now = () => Date.now()): void {
  if (!secret) throw new WebhookError('The Stripe webhook secret is not set.');
  if (!header) throw new WebhookError('The Stripe signature is missing.');
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || signatures.length === 0) throw new WebhookError('The Stripe signature is malformed.');
  if (Math.abs(now() / 1000 - Number(t)) > tolerance) throw new WebhookError('The Stripe signature is too old.');
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  const ok = signatures.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), expected));
  if (!ok) throw new WebhookError('The Stripe signature does not match.');
}

export function createStripeAdapter(options: StripeOptions): PaymentAdapter {
  const f: Fetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? 'https://api.stripe.com';

  async function api(path: string, init: { method?: string; form?: URLSearchParams } = {}): Promise<Obj> {
    if (!options.secretKey) throw new GatewayError('The Stripe secret key is not set. Add it under Settings, API keys.');
    const response = await f(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${options.secretKey}`, ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: init.form,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as Obj;
    if (!response.ok) throw new GatewayError(`Stripe: ${str((json.error as Obj | undefined)?.message) || response.status}`, response.status);
    return json;
  }

  const fromSession = (session: Obj, status: 'paid' | 'failed'): WebhookOutcome => {
    const pi = str(session.payment_intent);
    return {
      provider: 'stripe',
      idempotencyKey: status === 'paid' ? `stripe:${pi || str(session.id)}` : `stripe:${pi || str(session.id)}:failed`,
      orderId: str(session.client_reference_id) || str((session.metadata as Obj | undefined)?.order_id),
      status,
      amount: typeof session.amount_total === 'number' ? { amount: session.amount_total, currency: str(session.currency).toUpperCase() } : undefined,
      reference: pi || str(session.id),
      raw: { id: session.id, payment_status: session.payment_status, payment_intent: session.payment_intent },
    };
  };

  return {
    id: 'stripe',
    label: 'Card (Stripe)',
    kind: 'automatic',
    async createCheckout(r: CheckoutRequest): Promise<CheckoutStart> {
      const form = new URLSearchParams({
        mode: 'payment',
        success_url: `${r.returnUrl}${r.returnUrl.includes('?') ? '&' : '?'}paid=stripe`,
        cancel_url: r.cancelUrl,
        customer_email: r.customerEmail,
        client_reference_id: r.orderId,
        'metadata[order_id]': r.orderId,
        'metadata[order_number]': r.orderNumber,
        'payment_intent_data[metadata][order_id]': r.orderId,
        'payment_intent_data[description]': `${r.siteName} ${r.orderNumber}`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': r.total.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]': String(r.total.amount),
        'line_items[0][price_data][product_data][name]': r.description.slice(0, 250),
      });
      const session = await api('/v1/checkout/sessions', { method: 'POST', form });
      if (!session.url) throw new GatewayError('Stripe did not return a payment page.');
      return { kind: 'redirect', url: String(session.url), reference: str(session.id) };
    },
    async handleWebhook({ body, headers }) {
      verifyStripeSignature(body, headers.get('stripe-signature'), options.webhookSecret, options.tolerance, options.now);
      const event = JSON.parse(body) as { id: string; type: string; data: { object: Obj } };
      const o = event.data.object;
      switch (event.type) {
        case 'checkout.session.completed':
          return [o.payment_status === 'paid' ? fromSession(o, 'paid') : { provider: 'stripe', idempotencyKey: `stripe:event:${event.id}`, orderId: str(o.client_reference_id), status: 'ignored', raw: { type: event.type, payment_status: o.payment_status } }];
        case 'checkout.session.async_payment_succeeded':
          return [fromSession(o, 'paid')];
        case 'checkout.session.async_payment_failed':
          return [fromSession(o, 'failed')];
        case 'charge.refunded':
          return [{
            provider: 'stripe', idempotencyKey: `stripe:refund:${event.id}`, orderId: str((o.metadata as Obj | undefined)?.order_id), status: 'refunded',
            amount: { amount: Number(o.amount_refunded ?? 0), currency: str(o.currency).toUpperCase() }, cumulative: true, reference: str(o.payment_intent), raw: { id: o.id, amount_refunded: o.amount_refunded },
          }];
        default:
          return [{ provider: 'stripe', idempotencyKey: `stripe:event:${event.id}`, orderId: '', status: 'ignored', raw: { type: event.type } }];
      }
    },
    async refresh({ reference }: { reference: string; order: OrderRef }) {
      if (!reference.startsWith('cs_')) return null;
      const session = await api(`/v1/checkout/sessions/${encodeURIComponent(reference)}`);
      return session.payment_status === 'paid' ? fromSession(session, 'paid') : null;
    },
  };
}
