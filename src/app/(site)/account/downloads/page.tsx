import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountShell } from '@/components/site/account/Shell';
import { requireCustomerPage } from '@/lib/accounts/guard';
import { PAID_STATES } from '@/lib/checkout/status';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';
import { downloadsFor } from '@/lib/store/engine';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your downloads', robots: { index: false, follow: false } };

export default async function DownloadsPage() {
  if (!(await isOn('store'))) notFound();
  const customer = await requireCustomerPage('/account/downloads');
  const orders = await getDb().order.findMany({ where: { userId: customer.id, status: { in: [...PAID_STATES] }, items: { some: { kind: 'product' } } }, orderBy: { createdAt: 'desc' }, include: { items: true, payments: true }, take: 100 });
  const groups = (await Promise.all(orders.map(async (o) => ({ order: o, items: await downloadsFor(o) })))).filter((g) => g.items.length);
  return (
    <AccountShell customer={customer} active="downloads" title="Your downloads">
      {groups.length === 0 ? <p className="text-muted">You have no digital products yet.</p> : (
        <div className="space-y-6">
          {groups.map(({ order, items }) => (
            <section key={order.id} aria-label={`Order ${order.number}`} className="rounded-card border border-line bg-surface p-4">
              <h2 className="text-h5">Order {order.number}</h2>
              {items.map((d) => (
                <div key={d.itemId} className="mt-3">
                  <p className="font-medium text-ink">{d.title}</p>
                  <ul className="mt-1 space-y-1">{d.files.map((f) => <li key={f.index}><a className="text-primary underline" href={`/download/${order.token}/${d.itemId}/${f.index}`}>{f.name}</a>{f.limit > 0 ? <span className="ml-2 text-sm text-muted">{Math.max(0, f.limit - f.used)} of {f.limit} downloads left</span> : null}</li>)}</ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </AccountShell>
  );
}
