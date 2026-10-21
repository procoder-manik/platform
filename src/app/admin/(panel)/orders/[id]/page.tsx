import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { getOrderById } from '@/lib/checkout/orders';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { OrderDesk } from './order-desk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order' };

type Entry = Record<string, unknown>;
const list = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAreaPage('shop');
  if (!(await isOn('checkout'))) notFound();
  const order = await getOrderById((await params).id);
  if (!order) notFound();
  const [emails, site] = await Promise.all([getDb().emailLog.findMany({ where: { entity: 'order', entityId: order.id }, orderBy: { createdAt: 'desc' }, take: 20 }), getSetting(siteSettings)]);
  return (
    <OrderDesk
      timeZone={site.timeZone}
      order={{
        id: order.id, number: order.number, token: order.token, email: order.email, status: order.status, currency: order.currency,
        subtotal: order.subtotal, discount: order.discount, shipping: order.shipping, tax: order.tax, total: order.total, methodId: order.methodId,
        subscriptionId: order.subscriptionId, invoiceNumber: order.invoiceNumber, paidAt: order.paidAt?.toISOString() ?? null, createdAt: order.createdAt.toISOString(),
        customer: (order.customer ?? {}) as { name?: string; phone?: string },
        shippingAddress: (order.shippingAddress ?? null) as Record<string, string> | null,
        billingCountry: ((order.billingAddress ?? null) as { country?: string } | null)?.country ?? null,
        requirements: list(order.requirements) as { label: string; value: string }[],
        items: order.items.map((i) => ({ id: i.id, sku: i.sku, title: i.title, quantity: i.quantity, unitPrice: i.unitPrice })),
        payments: order.payments.map((p) => ({ id: p.id, provider: p.provider, status: p.status, amount: p.amount, currency: p.currency, reference: p.reference, proof: (p.proof ?? null) as Entry | null, createdAt: p.createdAt.toISOString() })),
        history: list(order.history) as { at: string; by: string; from: string | null; to: string; note?: string }[],
        notes: list(order.notes) as { at: string; by: string; text: string }[],
        updates: list(order.updates) as { at: string; by: string; text: string; fileUrl?: string | null; fileName?: string | null }[],
      }}
      emails={emails.map((e) => ({ id: e.id, template: e.template, subject: e.subject, ok: e.ok, error: e.error, at: e.createdAt.toISOString() }))}
    />
  );
}
