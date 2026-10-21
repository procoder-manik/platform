import { NextResponse, type NextRequest } from 'next/server';
import { loadAdapter } from '@/lib/adapters/payments';
import { applyOutcome, getOrderById } from '@/lib/checkout/orders';
import { isOn } from '@/lib/modules/server';
import { baseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

/**
 * Where PayPal and SSLCommerz send the buyer back. The address is never trusted: PayPal is captured and
 * SSLCommerz is validated with the gateway, and both must match the order. Only a successful, matching
 * result changes the order. Failed and cancelled returns just go back to the order page.
 */
async function handle(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = await baseUrl();
  const orderId = request.nextUrl.searchParams.get('order') ?? '';
  const order = orderId ? await getOrderById(orderId) : null;
  if (!order || !(await isOn('checkout'))) return NextResponse.redirect(`${base}/`, 303);
  const page = `${base}/order/${order.token}`;
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind && kind !== 'success') return NextResponse.redirect(`${page}?cancelled=1`, 303);
  try {
    const adapter = await loadAdapter(provider);
    if (!adapter?.handleReturn) return NextResponse.redirect(page, 303);
    const form = request.method === 'POST' ? new URLSearchParams(await request.text()) : null;
    const outcome = await adapter.handleReturn({ url: request.nextUrl, form, order: { id: order.id, number: order.number, total: order.total, currency: order.currency } });
    if (outcome) await applyOutcome(outcome);
  } catch (error) {
    console.error(`[payments] ${provider} return failed`, error);
    return NextResponse.redirect(`${page}?error=gateway`, 303);
  }
  return NextResponse.redirect(`${page}?returned=1`, 303);
}

export { handle as GET, handle as POST };
