import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';
import { getSetting } from '@/lib/data';
import { getSubscriptionById, openRenewalOrder } from '@/lib/subscriptions/engine';
import { siteSettings } from '@/modules/core/settings';
import { SubscriptionDesk } from './subscription-desk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Subscription' };

type Entry = Record<string, unknown>;
const list = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAreaPage('shop');
  if (!(await isOn('subscriptions'))) notFound();
  const sub = await getSubscriptionById((await params).id);
  if (!sub) notFound();
  const db = getDb();
  const [orders, emails, site, open] = await Promise.all([
    db.order.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, total: true, currency: true, invoiceNumber: true, createdAt: true } }),
    db.emailLog.findMany({ where: { entity: 'subscription', entityId: sub.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    getSetting(siteSettings),
    openRenewalOrder(sub.id),
  ]);
  return (
    <SubscriptionDesk
      timeZone={site.timeZone}
      sub={{
        id: sub.id, number: sub.number, token: sub.token, email: sub.email, title: sub.title, period: sub.period, status: sub.status, currency: sub.currency, amount: sub.amount,
        startedAt: sub.startedAt.toISOString(), currentPeriodStart: sub.currentPeriodStart.toISOString(), currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd, endedAt: sub.endedAt?.toISOString() ?? null, renewals: sub.renewals,
        customer: (sub.customer ?? {}) as { name?: string; phone?: string },
        history: list(sub.history) as { at: string; by: string; from: string | null; to: string; note?: string }[],
        notes: list(sub.notes) as { at: string; by: string; text: string }[],
        terms: sub.terms.map((t) => ({ id: t.id, kind: t.kind, periodStart: t.periodStart.toISOString(), periodEnd: t.periodEnd.toISOString(), amount: t.amount })),
        openRenewal: open ? { id: open.id, number: open.number, status: open.status, total: open.total } : null,
      }}
      orders={orders.map((o) => ({ id: o.id, number: o.number, status: o.status, total: o.total, currency: o.currency, invoiceNumber: o.invoiceNumber, at: o.createdAt.toISOString() }))}
      emails={emails.map((e) => ({ id: e.id, template: e.template, subject: e.subject, ok: e.ok, error: e.error, at: e.createdAt.toISOString() }))}
    />
  );
}
