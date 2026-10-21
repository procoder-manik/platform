import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createManualAdapter } from '@/lib/adapters/payments/manual';
import { createPayPalAdapter } from '@/lib/adapters/payments/paypal';
import { createSslCommerzAdapter } from '@/lib/adapters/payments/sslcommerz';
import { createStripeAdapter, verifyStripeSignature } from '@/lib/adapters/payments/stripe';
import { GatewayError, WebhookError, type CheckoutRequest } from '@/lib/adapters/payments/types';
import { getMethod } from '@/lib/checkout/methods';

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
function mockFetch(handler: (call: Call) => { status?: number; json: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? 'GET', headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})), body: init?.body ? String(init.body) : '' };
    calls.push(call);
    const r = handler(call);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, calls };
}

const request: CheckoutRequest = { orderId: 'ord_1', orderNumber: 'WL-261019-ABCD', total: { amount: 12_345, currency: 'USD' }, description: 'Websites: Pro', customerEmail: 'a@example.com', customerName: 'Sam', returnUrl: 'https://shop.test/api/payments/x/return?order=ord_1', cancelUrl: 'https://shop.test/order/tok?cancelled=1', notifyUrl: 'https://shop.test/api/payments/sslcommerz/webhook', siteName: 'Northlight' };
const order = { id: 'ord_1', number: 'WL-261019-ABCD', total: 12_345, currency: 'USD' };

const stripeSign = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

describe('Stripe', () => {
  const secret = 'whsec_testsecret1234567890';
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', client_reference_id: 'ord_1', amount_total: 12_345, currency: 'usd' } } });

  it('verifies the signature and refuses forgeries, old events and tampered bodies', () => {
    expect(() => verifyStripeSignature(body, stripeSign(body, secret), secret)).not.toThrow();
    expect(() => verifyStripeSignature(body, stripeSign(body, 'whsec_other_secret_value'), secret)).toThrow(WebhookError);
    expect(() => verifyStripeSignature(`${body} `, stripeSign(body, secret), secret)).toThrow(/does not match/);
    expect(() => verifyStripeSignature(body, stripeSign(body, secret, Math.floor(Date.now() / 1000) - 3600), secret)).toThrow(/too old/);
    expect(() => verifyStripeSignature(body, null, secret)).toThrow(/missing/);
    expect(() => verifyStripeSignature(body, 'garbage', secret)).toThrow(WebhookError);
    expect(() => verifyStripeSignature(body, stripeSign(body, secret), '')).toThrow(/not set/);
  });

  it('accepts any matching signature when several are sent', () => {
    const t = Math.floor(Date.now() / 1000);
    const good = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    expect(() => verifyStripeSignature(body, `t=${t},v1=${'0'.repeat(64)},v1=${good}`, secret)).not.toThrow();
  });

  it('turns events into outcomes', async () => {
    const adapter = createStripeAdapter({ secretKey: 'sk_test_x', webhookSecret: secret });
    const headers = new Headers({ 'stripe-signature': stripeSign(body, secret) });
    const [paid] = await adapter.handleWebhook!({ body, headers });
    expect(paid).toMatchObject({ status: 'paid', orderId: 'ord_1', idempotencyKey: 'stripe:pi_1', amount: { amount: 12_345, currency: 'USD' }, reference: 'pi_1' });

    const unpaid = JSON.stringify({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { id: 'cs_2', payment_status: 'unpaid', client_reference_id: 'ord_1' } } });
    expect((await adapter.handleWebhook!({ body: unpaid, headers: new Headers({ 'stripe-signature': stripeSign(unpaid, secret) }) }))[0]?.status).toBe('ignored');

    const failed = JSON.stringify({ id: 'evt_3', type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_3', payment_intent: 'pi_3', client_reference_id: 'ord_1' } } });
    expect((await adapter.handleWebhook!({ body: failed, headers: new Headers({ 'stripe-signature': stripeSign(failed, secret) }) }))[0]).toMatchObject({ status: 'failed', idempotencyKey: 'stripe:pi_3:failed' });

    const refund = JSON.stringify({ id: 'evt_4', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 5000, currency: 'usd', metadata: {} } } });
    expect((await adapter.handleWebhook!({ body: refund, headers: new Headers({ 'stripe-signature': stripeSign(refund, secret) }) }))[0]).toMatchObject({ status: 'refunded', cumulative: true, reference: 'pi_1', amount: { amount: 5000 } });

    await expect(adapter.handleWebhook!({ body, headers: new Headers({ 'stripe-signature': 't=1,v1=bad' }) })).rejects.toBeInstanceOf(WebhookError);
  });

  it('creates a checkout session with the amount from the order', async () => {
    const { impl, calls } = mockFetch(() => ({ json: { id: 'cs_9', url: 'https://checkout.stripe.com/c/pay/cs_9' } }));
    const start = await createStripeAdapter({ secretKey: 'sk_test_abc', webhookSecret: secret, fetch: impl }).createCheckout(request);
    expect(start).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_9', reference: 'cs_9' });
    const form = new URLSearchParams(calls[0]?.body);
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('12345');
    expect(form.get('line_items[0][price_data][currency]')).toBe('usd');
    expect(form.get('client_reference_id')).toBe('ord_1');
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk_test_abc');
  });

  it('reports gateway errors and a missing key in plain words', async () => {
    const { impl } = mockFetch(() => ({ status: 401, json: { error: { message: 'Invalid API Key provided' } } }));
    await expect(createStripeAdapter({ secretKey: 'sk_test_bad', webhookSecret: '', fetch: impl }).createCheckout(request)).rejects.toThrow(/Invalid API Key/);
    await expect(createStripeAdapter({ secretKey: '', webhookSecret: '' }).createCheckout(request)).rejects.toThrow(/secret key is not set/);
  });

  it('can ask Stripe whether a session was paid', async () => {
    const paid = mockFetch(() => ({ json: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', client_reference_id: 'ord_1', amount_total: 12_345, currency: 'usd' } }));
    expect(await createStripeAdapter({ secretKey: 'sk_test_x', webhookSecret: '', fetch: paid.impl }).refresh!({ reference: 'cs_1', order })).toMatchObject({ status: 'paid', idempotencyKey: 'stripe:pi_1' });
    const open = mockFetch(() => ({ json: { id: 'cs_1', payment_status: 'unpaid' } }));
    expect(await createStripeAdapter({ secretKey: 'sk_test_x', webhookSecret: '', fetch: open.impl }).refresh!({ reference: 'cs_1', order })).toBeNull();
  });
});

describe('PayPal', () => {
  const opts = { clientId: 'id', clientSecret: 'secret', testMode: true };
  const capturedOrder = (customId: string, value = '123.45') => ({ id: 'PP1', status: 'COMPLETED', purchase_units: [{ custom_id: customId, payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', custom_id: customId, amount: { currency_code: 'USD', value } }] } }] });

  it('creates an order in the sandbox and returns the approval page', async () => {
    const { impl, calls } = mockFetch((c) => (c.url.endsWith('/oauth2/token') ? { json: { access_token: 'tok', expires_in: 300 } } : { json: { id: 'PP1', links: [{ rel: 'payer-action', href: 'https://sandbox.paypal.com/approve/PP1' }] } }));
    const start = await createPayPalAdapter({ ...opts, fetch: impl }).createCheckout(request);
    expect(start).toEqual({ kind: 'redirect', url: 'https://sandbox.paypal.com/approve/PP1', reference: 'PP1' });
    expect(calls[0]?.url).toContain('api-m.sandbox.paypal.com');
    const unit = JSON.parse(calls[1]?.body ?? '{}').purchase_units[0];
    expect(unit.amount).toEqual({ currency_code: 'USD', value: '123.45' });
    expect(unit.custom_id).toBe('ord_1');
  });

  it('captures only an order that carries OUR order id', async () => {
    const wrong = mockFetch((c) => (c.url.endsWith('/oauth2/token') ? { json: { access_token: 't' } } : { json: { id: 'PP9', purchase_units: [{ custom_id: 'someone_elses_order' }] } }));
    const out = await createPayPalAdapter({ ...opts, fetch: wrong.impl }).handleReturn!({ url: new URL('https://x.test/?token=PP9'), form: null, order });
    expect(out).toBeNull();
    expect(wrong.calls.some((c) => c.url.endsWith('/capture'))).toBe(false);

    const right = mockFetch((c) => (c.url.endsWith('/oauth2/token') ? { json: { access_token: 't' } } : c.url.endsWith('/capture') ? { json: capturedOrder('ord_1') } : { json: { id: 'PP1', purchase_units: [{ custom_id: 'ord_1' }] } }));
    const paid = await createPayPalAdapter({ ...opts, fetch: right.impl }).handleReturn!({ url: new URL('https://x.test/?token=PP1'), form: null, order });
    expect(paid).toMatchObject({ status: 'paid', idempotencyKey: 'paypal:capture:CAP1', amount: { amount: 12_345, currency: 'USD' } });
  });

  it('reads an already captured order instead of failing', async () => {
    const m = mockFetch((c) => {
      if (c.url.endsWith('/oauth2/token')) return { json: { access_token: 't' } };
      if (c.url.endsWith('/capture')) return { status: 422, json: { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] } };
      return { json: capturedOrder('ord_1') };
    });
    const out = await createPayPalAdapter({ ...opts, fetch: m.impl }).handleReturn!({ url: new URL('https://x.test/?token=PP1'), form: null, order });
    expect(out?.status).toBe('paid');
  });

  it('verifies webhooks with PayPal and refuses unverified ones', async () => {
    const event = JSON.stringify({ id: 'WH1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1', custom_id: 'ord_1', amount: { currency_code: 'USD', value: '123.45' } } });
    const ok = mockFetch((c) => (c.url.endsWith('/oauth2/token') ? { json: { access_token: 't' } } : { json: { verification_status: 'SUCCESS' } }));
    const [out] = await createPayPalAdapter({ ...opts, webhookId: 'WID', fetch: ok.impl }).handleWebhook!({ body: event, headers: new Headers({ 'paypal-transmission-id': 'x' }) });
    expect(out).toMatchObject({ status: 'paid', orderId: 'ord_1', idempotencyKey: 'paypal:capture:CAP1' });

    const bad = mockFetch((c) => (c.url.endsWith('/oauth2/token') ? { json: { access_token: 't' } } : { json: { verification_status: 'FAILURE' } }));
    await expect(createPayPalAdapter({ ...opts, webhookId: 'WID', fetch: bad.impl }).handleWebhook!({ body: event, headers: new Headers() })).rejects.toBeInstanceOf(WebhookError);
    await expect(createPayPalAdapter({ ...opts, fetch: ok.impl }).handleWebhook!({ body: event, headers: new Headers() })).rejects.toThrow(/webhook ID is not set/);
  });

  it('explains sign-in failures', async () => {
    const m = mockFetch(() => ({ status: 401, json: { error_description: 'Client Authentication failed' } }));
    await expect(createPayPalAdapter({ ...opts, fetch: m.impl }).createCheckout(request)).rejects.toThrow(/Check the keys and Test mode/);
  });
});

describe('SSLCommerz', () => {
  const opts = { storeId: 'store1', storePassword: 'pass', testMode: true };
  const valid = (patch: Record<string, unknown> = {}) => ({ status: 'VALID', tran_id: 'WL-261019-ABCD-k1', val_id: 'V1', value_a: 'ord_1', amount: '12345.00', currency_type: 'USD', currency_amount: '123.45', currency: 'USD', bank_tran_id: 'BANK1', card_type: 'BKASH', ...patch });

  it('starts a session in the sandbox with our order id', async () => {
    const { impl, calls } = mockFetch(() => ({ json: { status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/gw/abc', sessionkey: 'SK1' } }));
    const start = await createSslCommerzAdapter({ ...opts, fetch: impl }).createCheckout(request);
    expect(start).toEqual({ kind: 'redirect', url: 'https://sandbox.sslcommerz.com/gw/abc', reference: 'SK1' });
    const form = new URLSearchParams(calls[0]?.body);
    expect(form.get('total_amount')).toBe('123.45');
    expect(form.get('value_a')).toBe('ord_1');
    expect(form.get('success_url')).toContain('/api/payments/sslcommerz/return?kind=success&order=ord_1');
    expect(form.get('tran_id')).toMatch(/^WL-261019-ABCD-/);
  });

  it('reports a refused session', async () => {
    const { impl } = mockFetch(() => ({ json: { status: 'FAILED', failedreason: 'Invalid Store ID' } }));
    await expect(createSslCommerzAdapter({ ...opts, fetch: impl }).createCheckout(request)).rejects.toThrow(/Invalid Store ID/);
    await expect(createSslCommerzAdapter({ storeId: '', storePassword: '', testMode: true }).createCheckout(request)).rejects.toBeInstanceOf(GatewayError);
  });

  it('marks paid only after the validator API confirms and the order matches', async () => {
    const good = mockFetch(() => ({ json: valid() }));
    const out = await createSslCommerzAdapter({ ...opts, fetch: good.impl }).handleReturn!({ url: new URL('https://x.test/'), form: new URLSearchParams({ val_id: 'V1', status: 'VALID' }), order });
    expect(out).toMatchObject({ status: 'paid', idempotencyKey: 'sslcommerz:V1', amount: { amount: 12_345, currency: 'USD' } });
    expect(good.calls[0]?.url).toContain('/validator/api/validationserverAPI.php');
    expect(good.calls[0]?.url).toContain('val_id=V1');

    const inv = mockFetch(() => ({ json: valid({ status: 'INVALID_TRANSACTION' }) }));
    expect(await createSslCommerzAdapter({ ...opts, fetch: inv.impl }).handleReturn!({ url: new URL('https://x.test/'), form: new URLSearchParams({ val_id: 'V1' }), order })).toBeNull();
    const other = mockFetch(() => ({ json: valid({ value_a: 'another_order' }) }));
    expect(await createSslCommerzAdapter({ ...opts, fetch: other.impl }).handleReturn!({ url: new URL('https://x.test/'), form: new URLSearchParams({ val_id: 'V1' }), order })).toBeNull();
    expect(await createSslCommerzAdapter({ ...opts, fetch: good.impl }).handleReturn!({ url: new URL('https://x.test/'), form: null, order })).toBeNull();
  });

  it('reports a wrong amount so the order is not marked paid', async () => {
    const cheap = mockFetch(() => ({ json: valid({ amount: '100.00', currency_amount: '1.00' }) }));
    const out = await createSslCommerzAdapter({ ...opts, fetch: cheap.impl }).handleReturn!({ url: new URL('https://x.test/'), form: new URLSearchParams({ val_id: 'V1' }), order });
    expect(out?.status).toBe('paid');
    expect(out?.amount?.amount).not.toBe(order.total);
  });

  it('checks IPN calls with the validator too', async () => {
    const good = mockFetch(() => ({ json: valid() }));
    const body = new URLSearchParams({ val_id: 'V1', tran_id: 'WL-261019-ABCD-k1', value_a: 'ord_1', status: 'VALID', amount: '12345.00', currency_type: 'USD', currency_amount: '123.45' }).toString();
    const [out] = await createSslCommerzAdapter({ ...opts, fetch: good.impl }).handleWebhook!({ body, headers: new Headers() });
    expect(out).toMatchObject({ status: 'paid', orderId: 'ord_1' });
    const [none] = await createSslCommerzAdapter({ ...opts, fetch: good.impl }).handleWebhook!({ body: 'status=FAILED&tran_id=x', headers: new Headers() });
    expect(none?.status).toBe('ignored');
  });
});

describe('manual methods', () => {
  it('shows the amount, the local amount, the details and the reference', async () => {
    const def = getMethod('bkash')!;
    const adapter = createManualAdapter({ def, label: 'bKash (personal)', details: 'Number: 01700000000\nAccount: Sam', local: { currency: 'BDT', rate: 122, orderCurrency: 'USD' } });
    const start = await adapter.createCheckout(request);
    expect(start.kind).toBe('instructions');
    if (start.kind === 'instructions') {
      expect(start.title).toBe('Pay with bKash (personal)');
      expect(start.proof).toBe('transaction');
      expect(start.lines).toContain('Amount to pay: $123.45');
      expect(start.lines.some((l) => l.includes('BDT') && l.includes('15,060.90'))).toBe(true);
      expect(start.lines).toContain('Number: 01700000000');
      expect(start.lines.at(-1)).toContain('WL-261019-ABCD');
    }
  });
  it('skips the local amount for another currency and for bank methods', async () => {
    const eur = await createManualAdapter({ def: getMethod('bkash')!, label: 'bKash', details: 'x', local: { currency: 'BDT', rate: 122, orderCurrency: 'USD' } }).createCheckout({ ...request, total: { amount: 1000, currency: 'EUR' } });
    expect(eur.kind === 'instructions' && eur.lines.some((l) => l.includes('BDT'))).toBe(false);
    const bank = await createManualAdapter({ def: getMethod('bank')!, label: 'Bank', details: 'IBAN 1', local: { currency: 'BDT', rate: 122, orderCurrency: 'USD' } }).createCheckout(request);
    expect(bank.kind === 'instructions' && bank.proof === 'upload' && !bank.lines.some((l) => l.includes('BDT'))).toBe(true);
  });
});
