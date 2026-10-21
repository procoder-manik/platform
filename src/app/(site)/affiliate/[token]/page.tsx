import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatDay } from '@/components/site/content/Cards';
import { formatMinor } from '@/lib/checkout/money';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings/store';
import { baseUrl } from '@/lib/url';
import { commissionTotals } from '@/lib/growth/engine';
import { COMMISSION_STATUS_LABEL } from '@/lib/growth/logic';
import { affiliateSettings } from '@/lib/growth/settings';
import { siteSettings } from '@/modules/core/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your affiliate dashboard', robots: { index: false, follow: false, nocache: true } };

const STATUS_NOTE: Record<string, string> = { pending: 'Your application is waiting for approval. Your link starts working once you are approved.', active: '', paused: 'Your account is paused, so new orders do not earn commission. What you earned before is still yours.' };

/** The private affiliate dashboard: reached only with the long token in the address. */
export default async function AffiliateDashboard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const a = await db.affiliate.findUnique({ where: { token } });
  if (!a) notFound();
  const [s, site, base, totals, commissions, payouts, orders] = await Promise.all([
    getSetting(affiliateSettings), getSetting(siteSettings), baseUrl(), commissionTotals(a.id),
    db.commission.findMany({ where: { affiliateId: a.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.payout.findMany({ where: { affiliateId: a.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    db.commission.count({ where: { affiliateId: a.id, status: { not: 'void' } } }),
  ]);
  const link = `${base}/a/${a.code}`;
  const rate = a.commissionPct ?? s.defaultPct;
  const note = STATUS_NOTE[a.status] ?? '';

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-6 md:py-20">
      <p className="text-sm text-muted">{site.siteName}</p>
      <h1 className="mt-1">Hello, {a.name}</h1>
      {note ? <p role="status" className="mt-4 rounded-input border border-warning p-3">{note}</p> : null}

      <section aria-labelledby="link" className="mt-8 rounded-card border border-line bg-surface p-5">
        <h2 id="link" className="text-h5">Your link</h2>
        <p className="mt-2 break-all font-mono text-sm text-ink">{link}</p>
        <p className="mt-2 text-sm text-muted">You earn {rate}% of what each customer pays for products or services, after discounts and without tax or shipping. Orders placed within {s.cookieDays} days of a click count. Commission is ready to pay {s.holdDays} days after the order is paid{s.minPayout > 0 ? `, and we pay once your ready balance reaches ${formatMinor(s.minPayout, totals[0]?.currency ?? 'USD')}` : ''}.</p>
        <p className="mt-2 text-sm text-muted">To send people to a page, add <code>?to=/shop</code> (or any page on this site) to your link.</p>
      </section>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4"><dt className="text-sm text-muted">Link clicks</dt><dd className="text-2xl font-semibold text-ink">{a.clicks}</dd></div>
        <div className="rounded-card border border-line bg-surface p-4"><dt className="text-sm text-muted">Orders</dt><dd className="text-2xl font-semibold text-ink">{orders}</dd></div>
        <div className="rounded-card border border-line bg-surface p-4"><dt className="text-sm text-muted">Code</dt><dd className="text-2xl font-semibold text-ink">{a.code}</dd></div>
      </dl>

      <section aria-labelledby="money" className="mt-10">
        <h2 id="money" className="text-h4">Commission</h2>
        {totals.length === 0 ? <p className="mt-2 text-muted">No commission yet.</p> : (
          <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[24rem] text-left">
              <thead className="border-b border-line text-sm text-muted"><tr><th scope="col" className="p-3 font-medium">Currency</th><th scope="col" className="p-3 text-right font-medium">Waiting</th><th scope="col" className="p-3 text-right font-medium">Ready to pay</th><th scope="col" className="p-3 text-right font-medium">Paid</th></tr></thead>
              <tbody>{totals.map((t) => <tr key={t.currency} className="border-b border-line last:border-0"><td className="p-3">{t.currency}</td><td className="p-3 text-right">{formatMinor(t.pending, t.currency)}</td><td className="p-3 text-right font-semibold text-ink">{formatMinor(t.approved, t.currency)}</td><td className="p-3 text-right">{formatMinor(t.paid, t.currency)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      {commissions.length ? (
        <section aria-labelledby="orders" className="mt-10">
          <h2 id="orders" className="text-h4">Recent orders</h2>
          <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-line text-muted"><tr><th scope="col" className="p-3 font-medium">Order</th><th scope="col" className="p-3 font-medium">Date</th><th scope="col" className="p-3 font-medium">Status</th><th scope="col" className="p-3 text-right font-medium">Commission</th></tr></thead>
              <tbody>{commissions.map((c) => <tr key={c.id} className="border-b border-line last:border-0"><td className="p-3 text-ink">{c.orderNumber}</td><td className="p-3">{formatDay(c.createdAt, 'UTC')}</td><td className="p-3">{COMMISSION_STATUS_LABEL[c.status] ?? c.status}{c.status === 'pending' ? `, ready ${formatDay(c.approveAt, 'UTC')}` : ''}</td><td className="p-3 text-right">{formatMinor(c.amount, c.currency)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {payouts.length ? (
        <section aria-labelledby="payouts" className="mt-10">
          <h2 id="payouts" className="text-h4">Payouts</h2>
          <ul className="mt-3 space-y-2 text-sm">{payouts.map((p) => <li key={p.id} className="rounded-input border border-line p-3"><span className="font-semibold text-ink">{formatMinor(p.amount, p.currency)}</span> <span className="text-muted">{formatDay(p.createdAt, 'UTC')}{p.method ? `, ${p.method}` : ''}{p.reference ? `, ${p.reference}` : ''}</span></li>)}</ul>
        </section>
      ) : null}

      <p className="mt-12 text-sm text-muted">Keep this address private: anyone who has it can see your dashboard.</p>
    </div>
  );
}
