'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { recordPayoutAction, setAffiliateStatusAction } from '@/lib/growth/admin-actions';
import { formatMinor } from '@/lib/checkout/money';
import { COMMISSION_STATUS_LABEL } from '@/lib/growth/logic';
import { Button, Notice, PageHeader, inputClass } from '@/components/admin/ui';
import { formatDate } from '@/components/admin/format';

interface Ready { affiliateId: string; name: string; email: string; details: string; currency: string; amount: number; count: number }
interface Props {
  timeZone: string;
  minPayout: number;
  waiting: { id: string; name: string; email: string; website: string | null; createdAt: string }[];
  ready: Ready[];
  commissions: { id: string; affiliate: string; orderNumber: string; amount: number; currency: string; status: string; approveAt: string; note: string | null; at: string }[];
  payouts: { id: string; affiliate: string; amount: number; currency: string; method: string | null; reference: string | null; at: string }[];
}

/** Applications waiting, balances ready to pay, and the recent commission and payout history. */
export function PayoutsDesk({ timeZone, minPayout, waiting, ready, commissions, payouts }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<Record<string, { method: string; reference: string; note: string }>>({});
  const key = (r: Ready) => `${r.affiliateId}:${r.currency}`;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader title="Affiliate payouts" description="Approve applications, then pay the commission that is ready. Recording a payout marks those commissions paid and emails the affiliate. You send the money yourself." actions={<Link href="/admin/affiliates" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">All affiliates</Link>} />
      {message ? <Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice> : null}

      {waiting.length ? (
        <section aria-labelledby="waiting" className="rounded-card border border-warning bg-surface p-5">
          <h2 id="waiting" className="font-display text-base font-semibold text-ink">Applications waiting ({waiting.length})</h2>
          <ul className="mt-3 space-y-3">
            {waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span><Link className="text-primary underline" href={`/admin/affiliates/${w.id}`}>{w.name}</Link> <span className="text-muted">{w.email}{w.website ? `, ${w.website}` : ''}, applied {formatDate(w.createdAt, timeZone)}</span></span>
                <span className="flex gap-2"><Button variant="primary" disabled={pending} onClick={() => run(() => setAffiliateStatusAction(w.id, 'active'))}>Approve</Button></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="ready" className="space-y-3">
        <h2 id="ready" className="font-display text-base font-semibold text-ink">Ready to pay</h2>
        {ready.length === 0 ? <p className="text-sm text-muted">Nothing is ready. Commission becomes ready after its hold, when no refund can cancel it any more.</p> : ready.map((r) => {
          const f = form[key(r)] ?? { method: '', reference: '', note: '' };
          const set = (patch: Partial<typeof f>) => setForm((x) => ({ ...x, [key(r)]: { ...f, ...patch } }));
          const below = r.amount < minPayout;
          return (
            <div key={key(r)} className="rounded-card border border-line bg-surface p-5">
              <p className="flex flex-wrap items-baseline justify-between gap-2"><span><Link className="font-medium text-primary underline" href={`/admin/affiliates/${r.affiliateId}`}>{r.name}</Link> <span className="text-sm text-muted">{r.email}, {r.count} order(s)</span></span><span className="text-xl font-semibold text-ink">{formatMinor(r.amount, r.currency)}</span></p>
              {r.details ? <p className="mt-2 whitespace-pre-line rounded-input bg-raised p-3 text-sm"><span className="font-medium text-ink">Pay to:</span> {r.details}</p> : <p className="mt-2 text-sm text-warning">No payout details saved. Ask them, or add them on their record.</p>}
              {below ? <p className="mt-2 text-sm text-muted">Below the smallest payout ({formatMinor(minPayout, r.currency)}).</p> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium text-ink">How you paid<input className={`${inputClass} mt-1`} value={f.method} onChange={(e) => set({ method: e.target.value })} placeholder="bKash, bank, PayPal" /></label>
                <label className="text-sm font-medium text-ink">Reference<input className={`${inputClass} mt-1`} value={f.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="Transaction ID" /></label>
                <label className="text-sm font-medium text-ink">Note<input className={`${inputClass} mt-1`} value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
              </div>
              <div className="mt-3"><Button variant="primary" disabled={pending} onClick={() => window.confirm(`Record a payout of ${formatMinor(r.amount, r.currency)} to ${r.name}? Only do this after you sent the money.`) && run(() => recordPayoutAction(r.affiliateId, r.currency, f.method, f.reference, f.note, below))}>{below ? 'Record payout anyway' : 'Record payout'}</Button></div>
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="comm" className="rounded-card border border-line bg-surface p-5">
          <h2 id="comm" className="font-display text-base font-semibold text-ink">Recent commission</h2>
          {commissions.length === 0 ? <p className="mt-3 text-sm text-muted">None yet.</p> : (
            <ul className="mt-3 space-y-2 text-sm">{commissions.map((c) => <li key={c.id}><span className="font-medium text-ink">{formatMinor(c.amount, c.currency)}</span> {c.affiliate}, order {c.orderNumber} <span className="text-muted">{COMMISSION_STATUS_LABEL[c.status] ?? c.status}{c.status === 'pending' ? `, ready ${formatDate(c.approveAt, timeZone)}` : ''}, {formatDate(c.at, timeZone)}</span>{c.note ? <span className="block text-warning">{c.note}</span> : null}</li>)}</ul>
          )}
        </section>
        <section aria-labelledby="paid" className="rounded-card border border-line bg-surface p-5">
          <h2 id="paid" className="font-display text-base font-semibold text-ink">Recent payouts</h2>
          {payouts.length === 0 ? <p className="mt-3 text-sm text-muted">None yet.</p> : (
            <ul className="mt-3 space-y-2 text-sm">{payouts.map((p) => <li key={p.id}><span className="font-medium text-ink">{formatMinor(p.amount, p.currency)}</span> to {p.affiliate} <span className="text-muted">{p.method ? `${p.method}, ` : ''}{p.reference ? `${p.reference}, ` : ''}{formatDate(p.at, timeZone)}</span></li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
