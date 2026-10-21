import { GatewayError, decimalToMinor, type CheckoutRequest, type CheckoutStart, type Fetch, type OrderRef, type PaymentAdapter, type WebhookOutcome } from './types';
import { toDecimal } from '@/lib/checkout/money';

export interface SslCommerzOptions {
  storeId: string;
  storePassword: string;
  testMode: boolean;
  fetch?: Fetch;
  baseUrl?: string;
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

export function createSslCommerzAdapter(options: SslCommerzOptions): PaymentAdapter {
  const f: Fetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? (options.testMode ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com');

  /**
   * The validator API is the only thing that marks an order paid: the address the buyer returns to can be
   * forged. The answer must also match our order (id, number, amount and currency).
   */
  async function validate(valId: string, order: OrderRef): Promise<WebhookOutcome | null> {
    if (!options.storeId || !options.storePassword) throw new GatewayError('The SSLCommerz store ID and password are not set. Add them under Settings, API keys.');
    const url = `${base}/validator/api/validationserverAPI.php?${new URLSearchParams({ val_id: valId, store_id: options.storeId, store_passwd: options.storePassword, format: 'json' })}`;
    const response = await f(url, { signal: AbortSignal.timeout(15_000) });
    const res = (await response.json().catch(() => ({}))) as Obj;
    if (!response.ok) throw new GatewayError(`SSLCommerz validation answered ${response.status}.`, response.status);
    if (res.status !== 'VALID' && res.status !== 'VALIDATED') return null;
    const sameOrder = str(res.value_a) === order.id && str(res.tran_id).startsWith(order.number);
    if (!sameOrder) return null;
    // The amount is in the gateway currency; the original is in currency_amount. Either may equal our total.
    const candidates = [
      { amount: decimalToMinor(str(res.amount)), currency: str(res.currency_type) },
      ...(res.currency_amount ? [{ amount: decimalToMinor(str(res.currency_amount)), currency: str(res.currency) || order.currency }] : []),
    ];
    const match = candidates.find((c) => c.currency.toUpperCase() === order.currency.toUpperCase() && c.amount === order.total);
    return {
      provider: 'sslcommerz',
      idempotencyKey: `sslcommerz:${valId}`,
      orderId: order.id,
      status: 'paid',
      amount: match ?? candidates[0],
      reference: str(res.bank_tran_id) || valId,
      raw: { val_id: valId, tran_id: res.tran_id, card_type: res.card_type, status: res.status },
    };
  }

  return {
    id: 'sslcommerz',
    label: 'Cards and mobile banking (SSLCommerz)',
    kind: 'automatic',
    async createCheckout(r: CheckoutRequest): Promise<CheckoutStart> {
      if (!options.storeId || !options.storePassword) throw new GatewayError('The SSLCommerz store ID and password are not set. Add them under Settings, API keys.');
      const back = (kind: string) => `${r.notifyUrl.replace(/\/webhook$/, '/return')}?kind=${kind}&order=${encodeURIComponent(r.orderId)}`;
      const form = new URLSearchParams({
        store_id: options.storeId, store_passwd: options.storePassword, total_amount: toDecimal(r.total.amount), currency: r.total.currency,
        tran_id: `${r.orderNumber}-${Date.now().toString(36)}`, success_url: back('success'), fail_url: back('fail'), cancel_url: back('cancel'), ipn_url: r.notifyUrl,
        cus_name: r.customerName.slice(0, 50) || 'Customer', cus_email: r.customerEmail, cus_add1: 'N/A', cus_city: 'N/A', cus_country: 'Bangladesh', cus_phone: r.customerPhone || '00000000000',
        shipping_method: 'NO', product_name: r.description.slice(0, 100), product_category: 'Service', product_profile: 'general', value_a: r.orderId,
      });
      const response = await f(`${base}/gwprocess/v4/api.php`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(20_000) });
      const res = (await response.json().catch(() => ({}))) as Obj;
      if (res.status !== 'SUCCESS' || !res.GatewayPageURL) throw new GatewayError(`SSLCommerz: ${str(res.failedreason) || `answered ${response.status}`}`, response.status);
      return { kind: 'redirect', url: str(res.GatewayPageURL), reference: str(res.sessionkey) };
    },
    async handleReturn({ form, order }) {
      const valId = form?.get('val_id');
      return valId ? validate(valId, order) : null;
    },
    async handleWebhook({ body }) {
      // The IPN carries val_id and tran_id; the order is found from value_a and checked again by validate().
      const form = new URLSearchParams(body);
      const valId = form.get('val_id');
      const orderId = form.get('value_a') ?? '';
      const tran = form.get('tran_id') ?? '';
      if (!valId || !orderId) return [{ provider: 'sslcommerz', idempotencyKey: `sslcommerz:ignored:${tran}:${form.get('status')}`, orderId: '', status: 'ignored', raw: { status: form.get('status') } }];
      const outcome = await validate(valId, { id: orderId, number: tran.split('-').slice(0, -1).join('-') || tran, total: decimalToMinor(form.get('currency_amount') ?? form.get('amount') ?? '0'), currency: form.get('currency_type') ?? '' });
      return [outcome ?? { provider: 'sslcommerz', idempotencyKey: `sslcommerz:invalid:${valId}`, orderId, status: 'ignored', raw: { reason: 'validation did not confirm' } }];
    },
  };
}
