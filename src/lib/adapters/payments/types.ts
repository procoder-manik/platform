/** Amounts are integer minor units (cents) with a currency code. Never floats. */
export interface Money {
  amount: number;
  currency: string;
}

export interface CheckoutRequest {
  orderId: string;
  orderNumber: string;
  total: Money;
  description: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  /** Where the buyer lands after paying (the private order page). */
  returnUrl: string;
  cancelUrl: string;
  /** Server-to-server callback address for gateways that need one. */
  notifyUrl: string;
  siteName: string;
}

export type CheckoutStart =
  | { kind: 'redirect'; url: string; reference: string }
  | { kind: 'instructions'; title: string; lines: string[]; proof: 'transaction' | 'upload' };

export interface WebhookOutcome {
  provider: string;
  /** Unique per provider event, stored so the same event is applied once. */
  idempotencyKey: string;
  /** Empty when the event does not carry our order id; `reference` then finds the payment. */
  orderId: string;
  status: 'paid' | 'failed' | 'refunded' | 'ignored';
  amount?: Money;
  /** For refunds: the amount is the running total refunded, not this refund alone. */
  cumulative?: boolean;
  reference?: string;
  raw: unknown;
}

export interface OrderRef {
  id: string;
  number: string;
  total: number;
  currency: string;
}

export interface PaymentAdapter {
  readonly id: string;
  readonly label: string;
  readonly kind: 'automatic' | 'manual';
  createCheckout(request: CheckoutRequest): Promise<CheckoutStart>;
  /** Verifies the signature and reads the events. Throws WebhookError when verification fails. */
  handleWebhook?(input: { body: string; headers: Headers }): Promise<WebhookOutcome[]>;
  /** The buyer came back from the gateway. May capture or validate with the gateway; never trusts the address alone. */
  handleReturn?(input: { url: URL; form: URLSearchParams | null; order: OrderRef }): Promise<WebhookOutcome | null>;
  /** Asks the gateway about a payment still pending, for when the webhook is late or not set up. */
  refresh?(input: { reference: string; order: OrderRef }): Promise<WebhookOutcome | null>;
}

/** A webhook that failed verification. The route answers 400. */
export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookError';
  }
}

export type Fetch = typeof fetch;

/** A gateway API answered with an error. The message is safe to show the owner, not the buyer. */
export class GatewayError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** "12.34" becomes 1234. */
export function decimalToMinor(value: string | number): number {
  return Math.round(Number(value) * 100);
}
