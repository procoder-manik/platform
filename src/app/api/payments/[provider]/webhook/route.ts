import { NextResponse } from 'next/server';
import { loadAdapter } from '@/lib/adapters/payments';
import { WebhookError } from '@/lib/adapters/payments/types';
import { applyOutcome } from '@/lib/checkout/orders';
import { isOn } from '@/lib/modules/server';

export const dynamic = 'force-dynamic';

/**
 * Gateway webhooks. The signature (or the gateway's own validation) is checked first; a bad one answers 400.
 * Verified events are applied once each, and unknown orders still answer 200 so the gateway stops retrying.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!(await isOn('checkout'))) return NextResponse.json({ ok: false, message: 'Checkout is switched off.' }, { status: 503 });
  const adapter = await loadAdapter(provider);
  if (!adapter?.handleWebhook) return NextResponse.json({ ok: false, message: 'Unknown payment method.' }, { status: 404 });
  const body = await request.text();
  try {
    const outcomes = await adapter.handleWebhook({ body, headers: request.headers });
    const results = [];
    for (const outcome of outcomes) results.push(await applyOutcome(outcome));
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    if (error instanceof WebhookError) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    console.error(`[payments] ${provider} webhook failed`, error);
    // A server error makes the gateway retry later.
    return NextResponse.json({ ok: false, message: 'Could not process the event.' }, { status: 500 });
  }
}
