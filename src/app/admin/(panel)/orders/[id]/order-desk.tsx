'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { addNoteAction, addUpdateAction, changeStatusAction, refundAction, sendInvoiceAction, verifyPaymentAction } from '@/lib/checkout/admin-actions';
import { formatMinor } from '@/lib/checkout/money';
import { STATUS_LABEL, STATUS_TONE, TRANSITIONS, type OrderStatusId } from '@/lib/checkout/status';
import { MediaDialog } from '@/components/admin/media/MediaPicker';
import { Button, Notice, PageHeader, inputClass } from '@/components/admin/ui';
import { formatDate } from '@/components/admin/format';

interface Order {
  id: string; number: string; token: string; email: string; status: string; currency: string; subtotal: number; discount: number; shipping: number; tax: number; total: number;
  methodId: string | null; subscriptionId: string | null; invoiceNumber: string | null; paidAt: string | null; createdAt: string; customer: { name?: string; phone?: string }; shippingAddress: Record<string, string> | null; billingCountry: string | null;
  requirements: { label: string; value: string }[]; items: { id: string; sku: string | null; title: string; quantity: number; unitPrice: number }[];
  payments: { id: string; provider: string; status: string; amount: number; currency: string; reference: string | null; proof: Record<string, unknown> | null; createdAt: string }[];
  history: { at: string; by: string; from: string | null; to: string; note?: string }[]; notes: { at: string; by: string; text: string }[];
  updates: { at: string; by: string; text: string; fileUrl?: string | null; fileName?: string | null }[];
}
interface Email { id: string; template: string; subject: string; ok: boolean; error: string | null; at: string }

const tone = { success: 'border-success text-success', warning: 'border-warning text-warning', danger: 'border-danger text-danger', muted: 'border-line text-muted' } as const;

function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-surface p-5">
      <h2 id={id} className="font-display text-base font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One order, worked from top to bottom: payments, status, refund, updates for the customer, private notes, history. */
export function OrderDesk({ order, emails, timeZone }: { order: Order; emails: Email[]; timeZone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [updateText, setUpdateText] = useState('');
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [updateNotify, setUpdateNotify] = useState(true);
  const [privateNote, setPrivateNote] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [reject, setReject] = useState<Record<string, string>>({});

  const money = (n: number) => formatMinor(n, order.currency);
  const s = order.status as OrderStatusId;
  const refunded = order.payments.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.amount, 0);
  const canRefund = ['PAID', 'IN_PROGRESS', 'COMPLETED', 'SHIPPED', 'DELIVERED'].includes(order.status) && refunded < order.total;
  const next = TRANSITIONS[s];

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
        title={`Order ${order.number}`}
        description={`${order.customer.name ?? 'Customer'}, ${order.email}. Placed ${formatDate(order.createdAt, timeZone)}.`}
        actions={
          <>
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${tone[STATUS_TONE[s]]}`}>{STATUS_LABEL[s]}</span>
            <Link href="/admin/orders" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">All orders</Link>
            <a href={`/order/${order.token}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">Customer view</a>
            {order.subscriptionId ? <Link href={`/admin/subscriptions/${order.subscriptionId}`} className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">Subscription</Link> : null}
            {order.invoiceNumber ? <a href={`/invoice/${order.token}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">Invoice {order.invoiceNumber}</a> : null}
          </>
        }
      />
      {message ? <Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Items and totals" id="items">
          <ul className="space-y-1 text-sm">{order.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span>{i.title}{i.sku ? ` [${i.sku}]` : ''}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span><span className="text-ink">{money(i.unitPrice * i.quantity)}</span></li>)}</ul>
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            {order.discount > 0 ? <div className="flex justify-between"><dt>Discount</dt><dd>-{money(order.discount)}</dd></div> : null}
            {order.shipping > 0 ? <div className="flex justify-between"><dt>Shipping</dt><dd>{money(order.shipping)}</dd></div> : null}
            {order.tax > 0 ? <div className="flex justify-between"><dt>Tax</dt><dd>{money(order.tax)}</dd></div> : null}
            <div className="flex justify-between text-base font-semibold text-ink"><dt>Total</dt><dd>{money(order.total)}</dd></div>
            {refunded > 0 ? <div className="flex justify-between text-warning"><dt>Refunded</dt><dd>{money(refunded)}</dd></div> : null}
          </dl>
          {order.requirements.length ? <div className="mt-4 border-t border-line pt-3 text-sm"><p className="font-medium text-ink">Answers from checkout</p><dl className="mt-1 space-y-1">{order.requirements.map((r) => <div key={r.label}><dt className="text-muted">{r.label}</dt><dd className="whitespace-pre-line text-ink">{r.value}</dd></div>)}</dl></div> : null}
          {order.customer.phone ? <p className="mt-3 text-sm">Phone: {order.customer.phone}</p> : null}
          {order.shippingAddress?.line1 ? <div className="mt-4 border-t border-line pt-3 text-sm"><p className="font-medium text-ink">Ship to</p><address className="not-italic">{[order.shippingAddress.name, order.shippingAddress.line1, order.shippingAddress.line2, [order.shippingAddress.postal, order.shippingAddress.city].filter(Boolean).join(' '), order.shippingAddress.region, order.shippingAddress.country].filter(Boolean).map((l, i) => <span key={i} className="block">{l}</span>)}</address></div> : order.billingCountry ? <p className="mt-3 text-sm">Billing country: {order.billingCountry}</p> : null}
        </Card>

        <Card title="Payments" id="payments">
          {order.payments.length === 0 ? <p className="text-sm text-muted">No payment attempts yet.</p> : (
            <ul className="space-y-3">
              {order.payments.map((p) => {
                const proof = p.proof ?? {};
                return (
                  <li key={p.id} className="rounded-input border border-line p-3 text-sm">
                    <p className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{p.provider}</span><span className={p.status === 'mismatch' || p.status === 'rejected' || p.status === 'failed' ? 'text-danger' : p.status === 'submitted' ? 'text-warning' : 'text-muted'}>{p.status}</span></p>
                    <p>{money(p.amount)}{p.reference ? `, ref ${p.reference}` : ''} <span className="text-muted">{formatDate(p.createdAt, timeZone)}</span></p>
                    {proof.sender ? <p>Paid from: {String(proof.sender)}</p> : null}
                    {proof.note ? <p>Note: {String(proof.note)}</p> : null}
                    {proof.url ? <p><a className="text-primary underline" href={String(proof.url)} target="_blank" rel="noopener noreferrer">Open receipt</a></p> : null}
                    {proof.duplicateOf ? <p className="text-danger" role="alert">This transaction ID was also used on order {String(proof.duplicateOf)}.</p> : null}
                    {p.status === 'mismatch' ? <p className="text-danger" role="alert">The amount did not match the order, so it was not accepted.</p> : null}
                    {p.status === 'submitted' ? (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="primary" disabled={pending} onClick={() => window.confirm(`Mark ${order.number} as paid? Check that ${money(order.total)} reached your account.`) && run(() => verifyPaymentAction(order.id, p.id, true, ''))}>Payment received</Button>
                        </div>
                        <label className="block text-xs text-muted">Reason, if you reject it (sent to the customer)<input className={`${inputClass} mt-1`} value={reject[p.id] ?? ''} onChange={(e) => setReject((r) => ({ ...r, [p.id]: e.target.value }))} /></label>
                        <Button variant="danger" disabled={pending} onClick={() => run(() => verifyPaymentAction(order.id, p.id, false, reject[p.id] ?? ''))}>Reject</Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Status" id="status">
        {next.length === 0 ? <p className="text-sm text-muted">This order is {STATUS_LABEL[s].toLowerCase()} and cannot change.</p> : (
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <label className="text-sm font-medium text-ink">Move to
              <select className={`${inputClass} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Choose…</option>
                {next.map((t) => <option key={t} value={t}>{STATUS_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-ink">Note (kept in the history)<input className={`${inputClass} mt-1`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the customer about this change</label>
            <div className="sm:col-span-2"><Button variant="primary" disabled={pending || !status} onClick={() => run(() => changeStatusAction(order.id, status, note, notify), () => { setStatus(''); setNote(''); })}>Change status</Button></div>
          </div>
        )}
        {order.invoiceNumber ? <div className="mt-4 border-t border-line pt-3"><Button disabled={pending} onClick={() => run(() => sendInvoiceAction(order.id))}>Email the invoice to the customer</Button></div> : null}
      </Card>

      {canRefund ? (
        <Card title="Record a refund" id="refund">
          <p className="text-sm">This records the refund on the order. It does not move money: send it back in your payment gateway or bank. You can refund up to {money(order.total - refunded)}.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
            <label className="text-sm font-medium text-ink">Amount<input inputMode="decimal" className={`${inputClass} mt-1`} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={((order.total - refunded) / 100).toFixed(2)} /></label>
            <label className="text-sm font-medium text-ink">Reason<input className={`${inputClass} mt-1`} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} /></label>
            <div className="self-end"><Button variant="danger" disabled={pending} onClick={() => window.confirm('Record this refund?') && run(() => refundAction(order.id, Math.round(Number(refundAmount || (order.total - refunded) / 100) * 100), refundReason), () => { setRefundAmount(''); setRefundReason(''); })}>Record refund</Button></div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Update for the customer" id="update">
          <p className="text-sm">Shown on the customer&apos;s order page. Attach a file to share a draft or a download.</p>
          <label className="mt-3 block text-sm font-medium text-ink">Message<textarea rows={3} className={`${inputClass} mt-1 py-2`} value={updateText} onChange={(e) => setUpdateText(e.target.value)} /></label>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Button onClick={() => setMediaOpen(true)}>{file ? 'Change file' : 'Attach a file'}</Button>
            {file ? <><span className="truncate">{file.name}</span><Button variant="ghost" onClick={() => setFile(null)}>Remove</Button></> : null}
          </div>
          <label className="mt-3 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={updateNotify} onChange={(e) => setUpdateNotify(e.target.checked)} />Email the customer</label>
          <div className="mt-2"><Button variant="primary" disabled={pending || !updateText.trim()} onClick={() => run(() => addUpdateAction(order.id, updateText, file?.url ?? '', file?.name ?? '', updateNotify), () => { setUpdateText(''); setFile(null); })}>Post update</Button></div>
          {order.updates.length ? <ol className="mt-4 space-y-2 border-t border-line pt-3 text-sm">{[...order.updates].reverse().map((u, i) => <li key={i}><span className="text-muted">{formatDate(u.at, timeZone)}, {u.by}</span><p className="whitespace-pre-line text-ink">{u.text}</p>{u.fileUrl ? <a className="text-primary underline" href={u.fileUrl} target="_blank" rel="noopener noreferrer">{u.fileName || 'File'}</a> : null}</li>)}</ol> : null}
          <MediaDialog open={mediaOpen} accept="any" onClose={() => setMediaOpen(false)} onPick={(url) => { setFile({ url, name: decodeURIComponent(url.split('/').pop() ?? 'File').slice(0, 100) }); setMediaOpen(false); }} />
        </Card>

        <Card title="Private notes" id="notes">
          <p className="text-sm">Only staff see these.</p>
          <label className="mt-3 block text-sm font-medium text-ink">Note<textarea rows={3} className={`${inputClass} mt-1 py-2`} value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} /></label>
          <div className="mt-2"><Button disabled={pending || !privateNote.trim()} onClick={() => run(() => addNoteAction(order.id, privateNote), () => setPrivateNote(''))}>Add note</Button></div>
          {order.notes.length ? <ol className="mt-4 space-y-2 border-t border-line pt-3 text-sm">{[...order.notes].reverse().map((n, i) => <li key={i}><span className="text-muted">{formatDate(n.at, timeZone)}, {n.by}</span><p className="whitespace-pre-line text-ink">{n.text}</p></li>)}</ol> : null}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="History" id="history">
          <ol className="space-y-2 text-sm">{[...order.history].reverse().map((h, i) => <li key={i}><span className="font-medium text-ink">{h.from && h.from !== h.to ? `${STATUS_LABEL[h.from as OrderStatusId] ?? h.from} to ${STATUS_LABEL[h.to as OrderStatusId] ?? h.to}` : (STATUS_LABEL[h.to as OrderStatusId] ?? h.to)}</span> <span className="text-muted">{formatDate(h.at, timeZone)}, {h.by}</span>{h.note ? <p>{h.note}</p> : null}</li>)}</ol>
        </Card>
        <Card title="Emails sent" id="emails">
          {emails.length === 0 ? <p className="text-sm text-muted">No emails yet.</p> : <ul className="space-y-1 text-sm">{emails.map((e) => <li key={e.id}><span className={e.ok ? 'text-success' : 'text-danger'}>{e.ok ? 'Sent' : 'Failed'}</span> {e.subject} <span className="text-muted">{formatDate(e.at, timeZone)}</span>{e.error ? <span className="block text-danger">{e.error}</span> : null}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
