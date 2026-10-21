/** API keys the owner can save in the admin (or set as environment variables). One registry for all phases. */
export interface KeyDef {
  name: string;
  label: string;
  group: string;
  help: string;
  /** Rough shape check, so a pasted wrong value is caught early. */
  pattern?: RegExp;
  patternHint?: string;
}

export const API_KEYS: readonly KeyDef[] = [
  { name: 'STRIPE_SECRET_KEY', label: 'Secret key', group: 'Stripe', help: 'Stripe Dashboard, Developers, API keys. Test keys start with sk_test_, live keys with sk_live_.', pattern: /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/, patternHint: 'It should start with sk_test_ or sk_live_.' },
  { name: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', group: 'Stripe', help: 'Stripe Dashboard, Developers, Webhooks. Add the address https://your-site/api/payments/stripe/webhook with the events checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed and charge.refunded, then copy its signing secret.', pattern: /^whsec_[A-Za-z0-9]{10,}$/, patternHint: 'It should start with whsec_.' },
  { name: 'PAYPAL_CLIENT_ID', label: 'Client ID', group: 'PayPal', help: 'PayPal Developer, Apps and credentials. Use sandbox credentials while Test mode is on.' },
  { name: 'PAYPAL_CLIENT_SECRET', label: 'Client secret', group: 'PayPal', help: 'From the same PayPal app as the client ID.' },
  { name: 'PAYPAL_WEBHOOK_ID', label: 'Webhook ID (optional)', group: 'PayPal', help: 'Optional but recommended. Add https://your-site/api/payments/paypal/webhook for PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED, then copy the webhook ID.' },
  { name: 'SSLCOMMERZ_STORE_ID', label: 'Store ID', group: 'SSLCommerz', help: 'From your SSLCommerz merchant panel (sandbox store ID while Test mode is on).' },
  { name: 'SSLCOMMERZ_STORE_PASSWORD', label: 'Store password', group: 'SSLCommerz', help: 'From the same SSLCommerz store. Set the IPN address to https://your-site/api/payments/sslcommerz/webhook.' },
];

export const getKeyDef = (name: string) => API_KEYS.find((k) => k.name === name);
