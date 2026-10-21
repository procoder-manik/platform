import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SubscriptionActions } from '@/components/site/client/SubscriptionActions';
import { formatDay } from '@/components/site/content/Cards';
import { formatMinor } from '@/lib/checkout/money';
import { getSetting } from '@/lib/data';
import { getSetting as getSettingFresh } from '@/lib/settings/store';
import { getSubscriptionByToken, openRenewalOrder, renewalAmount } from '@/lib/subscriptions/engine';
import { daysUntil, SUB_PERIOD_LABEL, SUB_STATUS_LABEL, SUB_STATUS_TONE, type SubPeriod, type SubStatusId } from '@/lib/subscriptions/schedule';
import { subscriptionSettings } from '@/lib/subscriptions/settings';
import { siteSettings } from '@/modules/core/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your plan', robots: { index: false, follow: false, nocache: true } };

const TONE = { success: 'border-success text-success', warning: 'border-warning text-warning', danger: 'border-danger text-danger', muted: 'border-line text-muted' } as const;
const KIND_LABEL: Record<string, string> = { first: 'First term', renewal: 'Renewal', restart: 'Started again', grant: 'Free days', manual: 'First term' };

type Entry = Record<string, unknown>;
const list = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);

/** The private plan page: reached only with the long token in the address. */
export default async function SubscriptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sub = await getSubscriptionByToken(token);
  if (!sub) notFound();

  const [site, cfg, open] = await Promise.all([getSetting(siteSettings), getSettingFresh(subscriptionSettings), openRenewalOrder(sub.id)]);
  const status = sub.status as SubStatusId;
  const period = (sub.period === 'yearly' ? 'yearly' : 'monthly') as SubPeriod;
  const left = daysUntil(sub.currentPeriodEnd, new Date());
  const price = await renewalAmount(sub, cfg);
  const ended = status === 'EXPIRED' || status === 'CANCELLED';
  const windowOpen = left <= cfg.leadDays;

  const actions: ('renew' | 'restart' | 'stop' | 'resume')[] = [];
  if (status === 'ACTIVE' && !sub.cancelAtPeriodEnd && (windowOpen || open)) actions.push('renew');
  if (status === 'PAST_DUE') actions.push('renew');
  if (status === 'ACTIVE' && sub.cancelAtPeriodEnd) actions.push('resume');
  if (status === 'ACTIVE' && !sub.cancelAtPeriodEnd && cfg.customerCanStop) actions.push('stop');
  if (ended && cfg.customerCanRestart) actions.push('restart');

  const history = list(sub.history).filter((h) => h.note);

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-6 md:py-20">
      <p className="text-sm text-muted">{site.siteName}</p>
      <h1 className="mt-1">{sub.title}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-3">
        <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${TONE[SUB_STATUS_TONE[status]]}`}>{SUB_STATUS_LABEL[status]}</span>
        <span className="text-sm text-muted">{sub.number} · {SUB_PERIOD_LABEL[period]} · {formatMinor(sub.amount, sub.currency)} per term</span>
      </p>

      {status === 'ACTIVE' && !sub.cancelAtPeriodEnd ? (
        <p role="status" className="mt-6 rounded-input border border-line p-3">Active until <strong>{formatDay(sub.currentPeriodEnd, 'UTC')}</strong>{left > 0 ? ` (${left} ${left === 1 ? 'day' : 'days'} left)` : ''}. Nothing is charged automatically: we email you an invoice {cfg.leadDays} {cfg.leadDays === 1 ? 'day' : 'days'} before the end and you pay it when you are ready.</p>
      ) : null}
      {status === 'ACTIVE' && sub.cancelAtPeriodEnd ? <p role="status" className="mt-6 rounded-input border border-warning p-3">This plan will not renew. It stays active until <strong>{formatDay(sub.currentPeriodEnd, 'UTC')}</strong>.</p> : null}
      {status === 'PAST_DUE' ? <p role="alert" className="mt-6 rounded-input border border-warning p-3">The end date ({formatDay(sub.currentPeriodEnd, 'UTC')}) has passed and the renewal is not paid yet. {cfg.graceDays > 0 ? `Your plan stays active until ${formatDay(new Date(sub.currentPeriodEnd.getTime() + cfg.graceDays * 86_400_000), 'UTC')}.` : ''} Pay the renewal to continue without a gap.</p> : null}
      {ended ? <p role="status" className="mt-6 rounded-input border border-line p-3">This plan ended on {formatDay(sub.endedAt ?? sub.currentPeriodEnd, 'UTC')}.{cfg.customerCanRestart ? ' You can start it again below.' : ' Please contact us if you would like to continue.'}</p> : null}

      {open ? (
        <section aria-labelledby="invoice" className="mt-10 rounded-card border border-primary bg-surface p-5">
          <h2 id="invoice" className="text-h4">Your renewal invoice</h2>
          <p className="mt-2">{open.number} for {formatMinor(open.total, open.currency)}{open.status === 'VERIFYING' ? ' is being checked. We will email you when it is confirmed.' : ' is waiting for payment.'}</p>
          <p className="mt-4"><Link href={`/order/${open.token}`} className="btn btn-primary">{open.status === 'VERIFYING' ? 'View the invoice' : 'Pay the renewal'}</Link></p>
        </section>
      ) : null}

      {actions.length ? (
        <section aria-labelledby="manage" className="mt-10">
          <h2 id="manage" className="text-h4">Manage your plan</h2>
          {ended || status === 'PAST_DUE' || windowOpen ? <p className="mt-2 text-sm text-muted">The next term costs about {formatMinor(price, sub.currency)} before tax.</p> : null}
          <div className="mt-4"><SubscriptionActions token={token} actions={actions} /></div>
        </section>
      ) : null}

      <section aria-labelledby="terms" className="mt-12">
        <h2 id="terms" className="text-h4">Payments and terms</h2>
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[28rem] text-left">
            <thead className="border-b border-line text-sm text-muted"><tr><th scope="col" className="p-3 font-medium">Term</th><th scope="col" className="p-3 font-medium">From</th><th scope="col" className="p-3 font-medium">To</th><th scope="col" className="p-3 text-right font-medium">Price</th></tr></thead>
            <tbody>{sub.terms.map((t) => <tr key={t.id} className="border-b border-line last:border-0"><td className="p-3 text-ink">{KIND_LABEL[t.kind] ?? t.kind}</td><td className="p-3">{formatDay(t.periodStart, 'UTC')}</td><td className="p-3">{formatDay(t.periodEnd, 'UTC')}</td><td className="p-3 text-right">{t.amount > 0 ? formatMinor(t.amount, sub.currency) : 'Free'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      {history.length ? (
        <section aria-labelledby="history" className="mt-12">
          <h2 id="history" className="text-h4">History</h2>
          <ol className="mt-4 space-y-2 border-l-2 border-line pl-5">
            {[...history].reverse().slice(0, 12).map((h, i) => (
              <li key={i} className="relative text-sm"><span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" /><span className="text-ink">{String(h.note)}</span> <span className="text-muted">{formatDay(String(h.at), 'UTC')}</span></li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="mt-12 text-sm text-muted">Keep this address private: anyone who has it can manage this plan.</p>
    </div>
  );
}
