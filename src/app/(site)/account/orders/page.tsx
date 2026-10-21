import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountShell } from '@/components/site/account/Shell';
import { formatDay } from '@/components/site/content/Cards';
import { accountSummary } from '@/lib/accounts/engine';
import { requireCustomerPage } from '@/lib/accounts/guard';
import { formatMinor } from '@/lib/checkout/money';
import { STATUS_LABEL, STATUS_TONE, type OrderStatusId } from '@/lib/checkout/status';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your orders', robots: { index: false, follow: false } };

const TONE = { success: 'border-success text-success', warning: 'border-warning text-warning', danger: 'border-danger text-danger', muted: 'border-line text-muted' } as const;

export default async function OrdersPage() {
  const customer = await requireCustomerPage('/account/orders');
  const { orders } = await accountSummary(customer);
  return (
    <AccountShell customer={customer} active="orders" title="Your orders">
      {orders.length === 0 ? <p className="text-muted">You have no orders yet.</p> : (
        <ul className="space-y-4">
          {orders.map((o) => (
            <li key={o.id} className="rounded-card border border-line bg-surface p-4">
              <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{o.number} <span className="text-sm font-normal text-muted">{formatDay(o.createdAt, 'UTC')}</span></span><span className={`rounded-full border px-3 py-0.5 text-sm ${TONE[STATUS_TONE[o.status as OrderStatusId] ?? 'muted']}`}>{STATUS_LABEL[o.status as OrderStatusId] ?? o.status}</span></p>
              <p className="mt-1 text-sm">{o.items.map((i) => i.title).join(', ')}</p>
              <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold text-ink">{formatMinor(o.total, o.currency)}</span><span className="flex gap-4"><Link className="text-primary underline" href={`/order/${o.token}`}>View order</Link>{o.invoiceNumber ? <Link className="text-primary underline" href={`/invoice/${o.token}`}>Invoice</Link> : null}</span></p>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
