import 'server-only';
import { getSetting } from '@/lib/settings/store';
import { getSecret } from '@/lib/security/secrets';
import { METHODS, getMethod, type MethodDef, type MethodId } from '@/lib/checkout/methods';
import { paymentSettings } from '@/lib/checkout/settings';
import { createManualAdapter } from './manual';
import { createPayPalAdapter } from './paypal';
import { createSslCommerzAdapter } from './sslcommerz';
import { createStripeAdapter } from './stripe';
import type { PaymentAdapter } from './types';

export type { PaymentAdapter, CheckoutRequest, CheckoutStart, WebhookOutcome, Money, OrderRef } from './types';

export interface MethodState {
  def: MethodDef;
  label: string;
  enabled: boolean;
  testMode: boolean;
  details: string;
  /** Keys present (gateways) or payment details written (manual). */
  configured: boolean;
  missing: string[];
}

/** Every method in the owner's order, with whether it can be offered. New methods from updates appear switched off at the end. */
export async function methodStates(): Promise<MethodState[]> {
  const settings = await getSetting(paymentSettings);
  const rows = [...settings.methods, ...METHODS.filter((m) => !settings.methods.some((r) => r.id === m.id)).map((m) => ({ id: m.id, enabled: false, label: m.label, details: '', testMode: true }))];
  const seen = new Set<string>();
  const out: MethodState[] = [];
  for (const row of rows) {
    const def = getMethod(row.id);
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    const missing: string[] = [];
    if (def.kind === 'automatic') {
      for (const name of def.secrets) if (!(await getSecret(name))) missing.push(name);
    } else if (!row.details.trim()) {
      missing.push('payment details');
    }
    out.push({ def, label: row.label.trim() || def.label, enabled: row.enabled, testMode: row.testMode, details: row.details, configured: missing.length === 0, missing });
  }
  return out;
}

/** What buyers see at checkout: switched on and ready. */
export async function availableMethods(): Promise<MethodState[]> {
  return (await methodStates()).filter((m) => m.enabled && m.configured);
}

/** Builds the adapter for a method. Webhook-only secrets may be missing; each adapter reports what it needs when used. */
export async function loadAdapter(id: string): Promise<PaymentAdapter | null> {
  const state = (await methodStates()).find((m) => m.def.id === id);
  if (!state) return null;
  const settings = await getSetting(paymentSettings);
  switch (id as MethodId) {
    case 'stripe':
      return createStripeAdapter({ secretKey: (await getSecret('STRIPE_SECRET_KEY')) ?? '', webhookSecret: (await getSecret('STRIPE_WEBHOOK_SECRET')) ?? '' });
    case 'paypal':
      return createPayPalAdapter({ clientId: (await getSecret('PAYPAL_CLIENT_ID')) ?? '', clientSecret: (await getSecret('PAYPAL_CLIENT_SECRET')) ?? '', webhookId: (await getSecret('PAYPAL_WEBHOOK_ID')) ?? undefined, testMode: state.testMode });
    case 'sslcommerz':
      return createSslCommerzAdapter({ storeId: (await getSecret('SSLCOMMERZ_STORE_ID')) ?? '', storePassword: (await getSecret('SSLCOMMERZ_STORE_PASSWORD')) ?? '', testMode: state.testMode });
    default:
      return createManualAdapter({
        def: state.def,
        label: state.label,
        details: state.details,
        local: settings.localCurrency && settings.localRate ? { currency: settings.localCurrency, rate: settings.localRate, orderCurrency: settings.currency } : null,
      });
  }
}
