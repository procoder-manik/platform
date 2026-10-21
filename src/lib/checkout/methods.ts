/** Payment methods the platform knows. Pure data: settings, checkout and the admin read it. */
export type MethodId = 'stripe' | 'paypal' | 'sslcommerz' | 'bkash' | 'nagad' | 'rocket' | 'bank' | 'wise' | 'payoneer';

export interface MethodDef {
  id: MethodId;
  label: string;
  kind: 'automatic' | 'manual';
  /** What the buyer does, in one line, shown at checkout. */
  hint: string;
  /** Keys that must exist (environment or API keys screen) before the method can be offered. */
  secrets: readonly string[];
  /** Manual methods: how the buyer proves payment. */
  proof?: 'transaction' | 'upload';
  /** Manual methods show the amount in the local currency when a rate is set. */
  local?: boolean;
}

export const METHODS: readonly MethodDef[] = [
  { id: 'stripe', label: 'Card (Stripe)', kind: 'automatic', hint: 'Pay by card on a secure Stripe page.', secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
  { id: 'paypal', label: 'PayPal', kind: 'automatic', hint: 'Pay with your PayPal account or a card.', secrets: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'] },
  { id: 'sslcommerz', label: 'Cards and mobile banking (SSLCommerz)', kind: 'automatic', hint: 'Pay with a card, bKash, Nagad, Rocket or net banking.', secrets: ['SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD'] },
  { id: 'bkash', label: 'bKash', kind: 'manual', hint: 'Send money to our bKash number, then enter the transaction ID.', secrets: [], proof: 'transaction', local: true },
  { id: 'nagad', label: 'Nagad', kind: 'manual', hint: 'Send money to our Nagad number, then enter the transaction ID.', secrets: [], proof: 'transaction', local: true },
  { id: 'rocket', label: 'Rocket', kind: 'manual', hint: 'Send money to our Rocket number, then enter the transaction ID.', secrets: [], proof: 'transaction', local: true },
  { id: 'bank', label: 'Bank transfer', kind: 'manual', hint: 'Transfer to our bank account, then upload the receipt.', secrets: [], proof: 'upload' },
  { id: 'wise', label: 'Wise', kind: 'manual', hint: 'Send with Wise, then upload the receipt.', secrets: [], proof: 'upload' },
  { id: 'payoneer', label: 'Payoneer', kind: 'manual', hint: 'Send with Payoneer, then upload the receipt.', secrets: [], proof: 'upload' },
];

export const METHOD_IDS = METHODS.map((m) => m.id) as MethodId[];
export const getMethod = (id: string): MethodDef | undefined => METHODS.find((m) => m.id === id);
