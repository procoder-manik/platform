'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { addSubscriptionNoteAction, cancelNowAction, grantDaysAction, sendRenewalInvoiceAction, setRenewingAction } from '@/lib/subscriptions/admin-actions';
import { formatMinor } from '@/lib/checkout/money';
import { STATUS_LABEL, type OrderStatusId } from '@/lib/checkout/status';
import { SUB_PERIOD_LABEL, SUB_STATUS_LABEL, SUB_STATUS_TONE, type SubPeriod, type SubStatusId } from '@/lib/subscriptions/schedule';
import { Button, Notice, PageHeader, inputClass } from '@/components/admin/ui';
import { formatDate } from '@/components/admin/format';

interface Sub {
  id: string; number: string; token: string; email: string; title: string; period: string; status: string; currency: string; amount: number;
  startedAt: string; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; endedAt: string | null; renewals: number;
  customer: { name?: string; phone?: string };
  history: { at: string; by: string; from: string | null; to: string; note?: string }[];
  notes: { at: string; by: string; text: string }[];
  terms: { id: string; kind: string; periodStart: string; periodEnd: string; amount: number }[];
  openRenewal: { id: string; number: string; status: string; total: number } | null;
}
interface OrderRow { id: string; number: string; status: string; total: number; currency: string; invoiceNumber: string | null; at: string }
interface Email { id: string; template: string; subject: string; ok: boolean; error: string | null; at: string }

const tone = { success: 'border-success text-success', warning: 'border-warning text-warning', danger: 'border-danger text-danger', muted: 'border-line text-muted' } as const;
const KIND: Record<string, string> = { first: 'First term', renewal: 'Renewal', restart: 'Started again', grant: 'Free days', manual: 'First term (paid outside the site)' };

function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5">
      <h2 id={id} className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One subscription, worked from top to bottom: dates, renewal invoice, free days, stopping, notes, history. */
export function SubscriptionDesk({ sub, orders, emails, timeZone }: { sub: Sub; orders: OrderRow[]; emails: Email[]; timeZone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [days, setDays] = useState('30');
  const [grantNote, setGrantNote] = useState('');
  const [endNote, setEndNote] = useState('');
  const [endNotify, setEndNotify] = useState(true);
  const [privateNote, setPrivateNote] = useState('');

  const s = sub.status as SubStatusId;
  const period = (sub.period === 'yearly' ? 'yearly' : 'monthly') as SubPeriod;
  const money = (n: number, c = sub.currency) => formatMinor(n, c);
  const ended = s === 'EXPIRED' || s === 'CANCELLED';

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={`Subscription ${sub.number}`}
        description={`${sub.customer.name ?? 'Customer'}, ${sub.email}. ${sub.title}, ${SUB_PERIOD_LABEL[period].toLowerCase()}, ${money(sub.amount)} per term.`}
        actions={
          <>
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${tone[SUB_STATUS_TONE[s]]}`}>{SUB_STATUS_LABEL[s]}{sub.cancelAtPeriodEnd && s === 'ACTIVE' ? ', not renewing' : ''}</span>
            <Link href="/admin/subscriptions" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">All subscriptions</Link>
            <a href={`/subscription/${sub.token}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">Customer view</a>
          </>
        }
      />
      {message ? <Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Dates" id="dates">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt>Started</dt><dd className="text-ink">{formatDate(sub.startedAt, timeZone)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Current term</dt><dd className="text-ink">{formatDate(sub.currentPeriodStart, timeZone)} to {formatDate(sub.currentPeriodEnd, timeZone)}</dd></div>
            {sub.endedAt ? <div className="flex justify-between gap-3"><dt>Ended</dt><dd className="text-ink">{formatDate(sub.endedAt, timeZone)}</dd></div> : null}
            <div className="flex justify-between gap-3"><dt>Paid renewals</dt><dd className="text-ink">{sub.renewals}</dd></div>
            {sub.customer.phone ? <div className="flex justify-between gap-3"><dt>Phone</dt><dd className="text-ink">{sub.customer.phone}</dd></div> : null}
          </dl>
        </Card>

        <Card title="Renewal" id="renewal">
          {sub.openRenewal ? (
            <p className="text-sm">Invoice <Link className="text-primary underline" href={`/admin/orders/${sub.openRenewal.id}`}>{sub.openRenewal.number}</Link> for {money(sub.openRenewal.total)} is {STATUS_LABEL[sub.openRenewal.status as OrderStatusId]?.toLowerCase() ?? sub.openRenewal.status}.</p>
          ) : <p className="text-sm text-muted">{ended ? 'The plan has ended. You can send an invoice to start it again.' : sub.cancelAtPeriodEnd ? 'This plan is set not to renew.' : 'No renewal invoice yet. It is created automatically before the end date.'}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!(s === 'ACTIVE' && sub.cancelAtPeriodEnd) ? <Button variant="primary" disabled={pending} onClick={() => run(() => sendRenewalInvoiceAction(sub.id))}>{sub.openRenewal ? 'Email the invoice again' : ended ? 'Send a restart invoice' : 'Send the renewal invoice now'}</Button> : null}
            {s === 'ACTIVE' && !sub.cancelAtPeriodEnd ? <Button disabled={pending} onClick={() => window.confirm('Stop renewing? The plan ends on its end date and the customer is emailed.') && run(() => setRenewingAction(sub.id, false))}>Stop renewing</Button> : null}
            {s === 'ACTIVE' && sub.cancelAtPeriodEnd ? <Button variant="primary" disabled={pending} onClick={() => run(() => setRenewingAction(sub.id, true))}>Renew as usual</Button> : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Add free days" id="grant">
          <p className="text-sm">Adds days after the current end date{ended ? ' (the plan starts again today)' : ''} and cancels any open renewal invoice, because the end date changes. The customer sees the new date on their plan page.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_auto]">
            <label className="text-sm font-medium text-ink">Days<input inputMode="numeric" className={`${inputClass} mt-1`} value={days} onChange={(e) => setDays(e.target.value)} /></label>
            <label className="text-sm font-medium text-ink">Private note<input className={`${inputClass} mt-1`} value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="Why, for your records" /></label>
            <div className="self-end"><Button variant="primary" disabled={pending} onClick={() => run(() => grantDaysAction(sub.id, Number(days), grantNote), () => setGrantNote(''))}>Add days</Button></div>
          </div>
        </Card>

        {!ended ? (
          <Card title="End the plan now" id="end">
            <p className="text-sm">Ends the plan today instead of at the end date. This does not refund anything: record a refund on the order if money goes back.</p>
            <label className="mt-3 block text-sm font-medium text-ink">Message to the customer (optional)<input className={`${inputClass} mt-1`} value={endNote} onChange={(e) => setEndNote(e.target.value)} /></label>
            <label className="mt-2 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={endNotify} onChange={(e) => setEndNotify(e.target.checked)} />Email the customer</label>
            <div className="mt-2"><Button variant="danger" disabled={pending} onClick={() => window.confirm('End this plan now?') && run(() => cancelNowAction(sub.id, endNote, endNotify), () => setEndNote(''))}>End the plan</Button></div>
          </Card>
        ) : <Card title="Ended" id="end"><p className="text-sm text-muted">This plan has ended. Add free days or send a restart invoice to bring it back.</p></Card>}
      </div>

      <Card title="Terms" id="terms">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-line text-muted"><tr><th scope="col" className="py-2 pr-3 font-medium">Term</th><th scope="col" className="py-2 pr-3 font-medium">From</th><th scope="col" className="py-2 pr-3 font-medium">To</th><th scope="col" className="py-2 text-right font-medium">Price</th></tr></thead>
            <tbody>{sub.terms.map((t) => <tr key={t.id} className="border-b border-line last:border-0"><td className="py-2 pr-3 text-ink">{KIND[t.kind] ?? t.kind}</td><td className="py-2 pr-3">{formatDate(t.periodStart, timeZone)}</td><td className="py-2 pr-3">{formatDate(t.periodEnd, timeZone)}</td><td className="py-2 text-right">{t.amount > 0 ? money(t.amount) : 'Free'}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Orders" id="orders">
          {orders.length === 0 ? <p className="text-sm text-muted">No orders yet. Plans added by staff have none until the first renewal.</p> : (
            <ul className="space-y-2 text-sm">{orders.map((o) => <li key={o.id} className="flex flex-wrap justify-between gap-2"><span><Link className="text-primary underline" href={`/admin/orders/${o.id}`}>{o.number}</Link> <span className="text-muted">{STATUS_LABEL[o.status as OrderStatusId] ?? o.status}, {formatDate(o.at, timeZone)}</span></span><span className="text-ink">{money(o.total, o.currency)}</span></li>)}</ul>
          )}
        </Card>

        <Card title="Private notes" id="notes">
          <p className="text-sm">Only staff see these.</p>
          <label className="mt-3 block text-sm font-medium text-ink">Note<textarea rows={3} className={`${inputClass} mt-1 py-2`} value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} /></label>
          <div className="mt-2"><Button disabled={pending || !privateNote.trim()} onClick={() => run(() => addSubscriptionNoteAction(sub.id, privateNote), () => setPrivateNote(''))}>Add note</Button></div>
          {sub.notes.length ? <ol className="mt-4 space-y-2 border-t border-line pt-3 text-sm">{[...sub.notes].reverse().map((n, i) => <li key={i}><span className="text-muted">{formatDate(n.at, timeZone)}, {n.by}</span><p className="whitespace-pre-line text-ink">{n.text}</p></li>)}</ol> : null}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="History" id="history">
          <ol className="space-y-2 text-sm">{[...sub.history].reverse().map((h, i) => <li key={i}><span className="font-medium text-ink">{h.from && h.from !== h.to ? `${SUB_STATUS_LABEL[h.from as SubStatusId] ?? h.from} to ${SUB_STATUS_LABEL[h.to as SubStatusId] ?? h.to}` : (SUB_STATUS_LABEL[h.to as SubStatusId] ?? h.to)}</span> <span className="text-muted">{formatDate(h.at, timeZone)}, {h.by}</span>{h.note ? <p>{h.note}</p> : null}</li>)}</ol>
        </Card>
        <Card title="Emails sent" id="emails">
          {emails.length === 0 ? <p className="text-sm text-muted">No emails yet.</p> : <ul className="space-y-1 text-sm">{emails.map((e) => <li key={e.id}><span className={e.ok ? 'text-success' : 'text-danger'}>{e.ok ? 'Sent' : 'Failed'}</span> {e.subject} <span className="text-muted">{formatDate(e.at, timeZone)}</span>{e.error ? <span className="block text-danger">{e.error}</span> : null}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
