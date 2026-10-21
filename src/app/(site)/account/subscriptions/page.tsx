import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccountShell } from '@/components/site/account/Shell';
import { formatDay } from '@/components/site/content/Cards';
import { accountSummary } from '@/lib/accounts/engine';
import { requireCustomerPage } from '@/lib/accounts/guard';
import { formatMinor } from '@/lib/checkout/money';
import { isOn } from '@/lib/modules/server';
import { SUB_STATUS_LABEL, SUB_STATUS_TONE, type SubStatusId } from '@/lib/subscriptions/schedule';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your subscriptions', robots: { index: false, follow: false } };

const TONE = { success: 'border-success text-success', warning: 'border-warning text-warning', danger: 'border-danger text-danger', muted: 'border-line text-muted' } as const;

export default async function SubscriptionsPage() {
  if (!(await isOn('subscriptions'))) notFound();
  const customer = await requireCustomerPage('/account/subscriptions');
  const { subs } = await accountSummary(customer);
  return (
    <AccountShell customer={customer} active="subscriptions" title="Your subscriptions">
      {subs.length === 0 ? <p className="text-muted">You have no subscriptions.</p> : (
        <ul className="space-y-4">
          {subs.map((p) => {
            const s = p.status as SubStatusId;
            return (
              <li key={p.id} className="rounded-card border border-line bg-surface p-4">
                <p className="flex flex-wrap items-center justify-between gap-2"><Link className="font-medium text-primary underline" href={`/subscription/${p.token}`}>{p.title}</Link><span className={`rounded-full border px-3 py-0.5 text-sm ${TONE[SUB_STATUS_TONE[s]]}`}>{SUB_STATUS_LABEL[s]}{p.cancelAtPeriodEnd && s === 'ACTIVE' ? ', not renewing' : ''}</span></p>
                <p className="mt-1 text-sm text-muted">{p.number} · {formatMinor(p.amount, p.currency)} {p.period === 'yearly' ? 'a year' : 'a month'} · {s === 'ACTIVE' || s === 'PAST_DUE' ? `until ${formatDay(p.currentPeriodEnd, 'UTC')}` : `ended ${formatDay(p.endedAt ?? p.currentPeriodEnd, 'UTC')}`}</p>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}
