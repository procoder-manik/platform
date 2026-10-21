import { GatewayError, WebhookError, decimalToMinor, type CheckoutRequest, type CheckoutStart, type Fetch, type OrderRef, type PaymentAdapter, type WebhookOutcome } from './types';
import { toDecimal } from '@/lib/checkout/money';

export interface PayPalOptions {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  testMode: boolean;
  fetch?: Fetch;
  baseUrl?: string;
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function createPayPalAdapter(options: PayPalOptions): PaymentAdapter {
  const f: Fetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? (options.testMode ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
  let token: { value: string; expires: number } | null = null;

  async function accessToken(): Promise<string> {
    if (!options.clientId || !options.clientSecret) throw new GatewayError('The PayPal client ID and secret are not set. Add them under Settings, API keys.');
    if (token && token.expires > Date.now() + 30_000) return token.value;
    const response = await f(`${base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as Obj;
    if (!response.ok || !json.access_token) throw new GatewayError(`PayPal sign-in failed: ${str(json.error_description) || response.status}. Check the keys and Test mode.`, response.status);
    token = { value: String(json.access_token), expires: Date.now() + Number(json.expires_in ?? 300) * 1000 };
    return token.value;
  }

  async function api(path: string, init: { method?: string; json?: unknown; requestId?: string } = {}): Promise<{ status: number; body: Obj }> {
    const response = await f(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}) },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as Obj };
  }

  /** Turns a PayPal order (after capture) into an outcome, checking that it belongs to our order. */
  function fromCapturedOrder(order: Obj, ours: OrderRef): WebhookOutcome | null {
    const unit = ((order.purchase_units as Obj[] | undefined) ?? [])[0];
    const capture = (((unit?.payments as Obj | undefined)?.captures as Obj[] | undefined) ?? [])[0];
    if (!unit || !capture) return null;
    const custom = str(capture.custom_id) || str(unit.custom_id);
    if (custom && custom !== ours.id) return null;
    const amount = capture.amount as Obj | undefined;
    const status = str(capture.status);
    return {
      provider: 'paypal',
      idempotencyKey: `paypal:capture:${str(capture.id)}`,
      orderId: ours.id,
      status: status === 'COMPLETED' ? 'paid' : status === 'DECLINED' || status === 'FAILED' ? 'failed' : 'ignored',
      amount: amount ? { amount: decimalToMinor(str(amount.value)), currency: str(amount.currency_code) } : undefined,
      reference: str(capture.id),
      raw: { order: order.id, capture: capture.id, status },
    };
  }

  return {
    id: 'paypal',
    label: 'PayPal',
    kind: 'automatic',
    async createCheckout(r: CheckoutRequest): Promise<CheckoutStart> {
      const { status, body } = await api('/v2/checkout/orders', {
        method: 'POST',
        requestId: `${r.orderId}-${Date.now()}`,
        json: {
          intent: 'CAPTURE',
          purchase_units: [{ reference_id: r.orderNumber, custom_id: r.orderId, invoice_id: `${r.orderNumber}-${Date.now().toString(36)}`, description: r.description.slice(0, 120), amount: { currency_code: r.total.currency, value: toDecimal(r.total.amount) } }],
          payment_source: { paypal: { experience_context: { brand_name: r.siteName.slice(0, 120), user_action: 'PAY_NOW', return_url: `${r.returnUrl}${r.returnUrl.includes('?') ? '&' : '?'}provider=paypal`, cancel_url: r.cancelUrl } } },
        },
      });
      if (status >= 400) throw new GatewayError(`PayPal: ${str(body.message) || str((body.details as Obj[] | undefined)?.[0]?.description) || status}`, status);
      const link = ((body.links as Obj[] | undefined) ?? []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
      if (!link?.href) throw new GatewayError('PayPal did not return an approval page.');
      return { kind: 'redirect', url: String(link.href), reference: str(body.id) };
    },
    async handleReturn({ url, order }) {
      const paypalOrder = url.searchParams.get('token');
      if (!paypalOrder) return null;
      // Look before capturing: the PayPal order must carry OUR order id, otherwise a buyer could approve
      // one order and have the return address of another capture their money for nothing.
      const peek = await api(`/v2/checkout/orders/${encodeURIComponent(paypalOrder)}`);
      if (peek.status >= 400) throw new GatewayError(`PayPal: ${str(peek.body.message) || peek.status}`, peek.status);
      const peekUnit = ((peek.body.purchase_units as Obj[] | undefined) ?? [])[0];
      if (str(peekUnit?.custom_id) !== order.id) return null;
      let { status, body } = await api(`/v2/checkout/orders/${encodeURIComponent(paypalOrder)}/capture`, { method: 'POST', requestId: `capture-${paypalOrder}`, json: {} });
      const issue = str(((body.details as Obj[] | undefined) ?? [])[0]?.issue);
      if (status === 422 && issue === 'ORDER_ALREADY_CAPTURED') ({ status, body } = await api(`/v2/checkout/orders/${encodeURIComponent(paypalOrder)}`));
      if (status >= 400) throw new GatewayError(`PayPal: ${str(body.message) || status}`, status);
      return fromCapturedOrder(body, order);
    },
    async handleWebhook({ body, headers }) {
      if (!options.webhookId) throw new WebhookError('The PayPal webhook ID is not set, so the event cannot be verified.');
      const event = JSON.parse(body) as Obj;
      const verify = await api('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        json: {
          auth_algo: headers.get('paypal-auth-algo'), cert_url: headers.get('paypal-cert-url'), transmission_id: headers.get('paypal-transmission-id'),
          transmission_sig: headers.get('paypal-transmission-sig'), transmission_time: headers.get('paypal-transmission-time'), webhook_id: options.webhookId, webhook_event: event,
        },
      });
      if (verify.body.verification_status !== 'SUCCESS') throw new WebhookError('PayPal could not verify this event.');
      const resource = (event.resource ?? {}) as Obj;
      const amount = resource.amount as Obj | undefined;
      const money = amount ? { amount: decimalToMinor(str(amount.value)), currency: str(amount.currency_code) } : undefined;
      switch (event.event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          return [{ provider: 'paypal', idempotencyKey: `paypal:capture:${str(resource.id)}`, orderId: str(resource.custom_id), status: 'paid', amount: money, reference: str(resource.id), raw: { id: event.id, type: event.event_type } }];
        case 'PAYMENT.CAPTURE.DENIED':
          return [{ provider: 'paypal', idempotencyKey: `paypal:capture:${str(resource.id)}:failed`, orderId: str(resource.custom_id), status: 'failed', amount: money, reference: str(resource.id), raw: { id: event.id, type: event.event_type } }];
        case 'PAYMENT.CAPTURE.REFUNDED': {
          const up = ((resource.links as Obj[] | undefined) ?? []).find((l) => l.rel === 'up');
          const capture = str(up?.href).split('/').pop() ?? '';
          return [{ provider: 'paypal', idempotencyKey: `paypal:refund:${str(resource.id)}`, orderId: str(resource.custom_id), status: 'refunded', amount: money, reference: capture, raw: { id: event.id, type: event.event_type } }];
        }
        default:
          return [{ provider: 'paypal', idempotencyKey: `paypal:event:${str(event.id)}`, orderId: '', status: 'ignored', raw: { type: event.event_type } }];
      }
    },
  };
}
