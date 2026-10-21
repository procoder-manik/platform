import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountShell } from '@/components/site/account/Shell';
import { formatDay } from '@/components/site/content/Cards';
import { accountSummary } from '@/lib/accounts/engine';
import { requireCustomerPage } from '@/lib/accounts/guard';
import { formatMinor } from '@/lib/checkout/money';
import { STATUS_LABEL, type OrderStatusId } from '@/lib/checkout/status';
import { isOn } from '@/lib/modules/server';
import { baseUrl } from '@/lib/url';
import { SUB_STATUS_LABEL, type SubStatusId } from '@/lib/subscriptions/schedule';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } };

export default async function AccountPage() {
  const customer = await requireCustomerPage('/account');
  const [s, base, store, subs] = await Promise.all([accountSummary(customer), baseUrl(), isOn('store'), isOn('subscriptions')]);
  const recent = s.orders.slice(0, 3);
  const live = s.subs.filter((x) => x.status === 'ACTIVE' || x.status === 'PAST_DUE');
  return (
    <AccountShell customer={customer} active="overview" title={`Hello, ${customer.name?.split(' ')[0] ?? 'there'}`} hide={[...(store ? [] : ['wishlist' as const]), ...(subs ? [] : ['subscriptions' as const])]}>
      <section aria-labelledby="recent">
        <h2 id="recent" className="text-h4">Recent orders</h2>
        {recent.length === 0 ? <p className="mt-2 text-muted">No orders yet.</p> : (
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface">
            {recent.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><span><Link className="font-medium text-primary underline" href={`/order/${o.token}`}>{o.number}</Link> <span className="text-sm text-muted">{formatDay(o.createdAt, 'UTC')}, {STATUS_LABEL[o.status as OrderStatusId] ?? o.status}</span></span><span className="text-ink">{formatMinor(o.total, o.currency)}</span></li>)}
          </ul>
        )}
        {s.orders.length > 3 ? <p className="mt-2"><Link className="text-primary underline" href="/account/orders">All orders</Link></p> : null}
      </section>

      {live.length ? (
        <section aria-labelledby="plans" className="mt-10">
          <h2 id="plans" className="text-h4">Your plans</h2>
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface">
            {live.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><Link className="font-medium text-primary underline" href={`/subscription/${p.token}`}>{p.title}</Link><span className="text-sm text-muted">{SUB_STATUS_LABEL[p.status as SubStatusId]}, until {formatDay(p.currentPeriodEnd, 'UTC')}</span></li>)}
          </ul>
        </section>
      ) : null}

      {s.referral ? (
        <section aria-labelledby="share" className="mt-10 rounded-card border border-line bg-surface p-5">
          <h2 id="share" className="text-h5">Share and earn</h2>
          <p className="mt-2">Your code is <strong>{s.referral.code}</strong>. Friends who use it on their first order save money, and you get a reward when they pay.</p>
          <p className="mt-1 break-all font-mono text-sm">{base}/ref/{s.referral.code}</p>
        </section>
      ) : null}
      {s.affiliate ? <p className="mt-6"><Link className="text-primary underline" href={`/affiliate/${s.affiliate.token}`}>Open your affiliate dashboard</Link></p> : null}
    </AccountShell>
  );
}
