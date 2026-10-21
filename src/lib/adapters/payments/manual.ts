import { convertMinor, formatMinor } from '@/lib/checkout/money';
import type { MethodDef } from '@/lib/checkout/methods';
import type { CheckoutRequest, CheckoutStart, PaymentAdapter } from './types';

export interface ManualOptions {
  def: MethodDef;
  label: string;
  details: string;
  /** Local currency shown next to the amount, when a rate is set for this order's currency. */
  local?: { currency: string; rate: number; orderCurrency: string } | null;
}

/** Mobile money and bank-type methods: show where to pay, then the buyer submits proof and the owner verifies. */
export function createManualAdapter(options: ManualOptions): PaymentAdapter {
  return {
    id: options.def.id,
    label: options.label,
    kind: 'manual',
    async createCheckout(r: CheckoutRequest): Promise<CheckoutStart> {
      const lines = [`Amount to pay: ${formatMinor(r.total.amount, r.total.currency)}`];
      if (options.def.local && options.local && options.local.orderCurrency === r.total.currency) {
        lines.push(`In ${options.local.currency}: ${formatMinor(convertMinor(r.total.amount, options.local.rate), options.local.currency)}`);
      }
      lines.push(...options.details.split('\n').map((l) => l.trim()).filter(Boolean));
      lines.push(`Use ${r.orderNumber} as the reference.`);
      return { kind: 'instructions', title: `Pay with ${options.label}`, lines, proof: options.def.proof ?? 'transaction' };
    },
  };
}
