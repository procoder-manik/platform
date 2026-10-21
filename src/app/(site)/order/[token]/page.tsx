import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { availableMethods } from '@/lib/adapters/payments';
import { getStorage } from '@/lib/adapters/storage';
import { formatMinor } from '@/lib/checkout/money';
import { getOrderByToken, manualInstructions, refreshPending, type FullOrder } from '@/lib/checkout/orders';
import { PAYABLE, STATUS_LABEL, STATUS_TONE, type OrderStatusId } from '@/lib/checkout/status';
import { MethodPicker, PendingPoller, ProofForm } from '@/components/site/client/OrderPay';
import { formatDay } from '@/components/site/content/Cards';
import { getSetting } from '@/lib/data';
import { getDb } from '@/lib/db';
import { downloadsFor } from '@/lib/store/engine';
import { siteSettings } from '@/modules/core/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false, nocache: true } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> };
type Entry = Record<string, unknown>;
const list = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);

const TONE = { success: 'border-success text-success', warning: 'border-warning text-warning', danger: 'border-danger text-danger', muted: 'border-line text-muted' } as const;

/** The private order page: reached only with the long token in the address. */
export default async function OrderPage({ params, searchParams }: Props) {
  const { token } = await params;
  const q = await searchParams;
  let order = await getOrderByToken(token);
  if (!order) notFound();
  // Ask the gateway if a card payment is still pending (the webhook may be late or not set up yet).
  if (order.status === 'PENDING_PAYMENT' && (await refreshPending(order))) order = (await getOrderByToken(token)) as FullOrder;

  const [site, methods] = await Promise.all([getSetting(siteSettings), availableMethods()]);
  const status = order.status as OrderStatusId;
  const money = (n: number) => formatMinor(n, order.currency);
  const payable = (PAYABLE as readonly string[]).includes(status);
  const current = methods.find((m) => m.def.id === order.methodId);
  const instructions = (payable || status === 'VERIFYING') && current?.def.kind === 'manual' ? await manualInstructions(order) : null;
  const submitted = [...order.payments].reverse().find((p) => p.status === 'submitted');
  const updates = list(order.updates).reverse();
  const history = list(order.history);
  const refunded = order.payments.filter((p) => p.status === 'refunded').reduce((n, p) => n + p.amount, 0);
  const downloads = await downloadsFor(order);
  const ship = (order.shippingAddress ?? null) as Record<string, string> | null;
  const waiting = status === 'PENDING_PAYMENT' && Boolean(q.paid || q.returned);
  const plan = order.subscriptionId ? await getDb().subscription.findUnique({ where: { id: order.subscriptionId }, select: { token: true, number: true, title: true } }) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-6 md:py-20">
      <PendingPoller active={waiting} />
      <p className="text-sm text-muted">{site.siteName}</p>
      <h1 className="mt-1">Order {order.number}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-3">
        <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${TONE[STATUS_TONE[status]]}`}>{STATUS_LABEL[status]}</span>
        <span className="text-sm text-muted">Placed {formatDay(order.createdAt, 'UTC')}</span>
      </p>

      {q.cancelled ? <p role="status" className="mt-6 rounded-input border border-warning p-3">You left the payment page without paying. Your order is saved: you can pay below.</p> : null}
      {q.error === 'gateway' ? <p role="alert" className="mt-6 rounded-input border border-danger p-3 text-danger">The payment provider could not be reached. Please choose a method again below.</p> : null}
      {q.sent ? <p role="status" className="mt-6 rounded-input border border-success p-3">Thank you. We have your payment details and will check them shortly.</p> : null}
      {waiting ? <p role="status" className="mt-6 rounded-input border border-line p-3">Confirming your payment. This page updates by itself, usually within a few seconds.</p> : null}

      <section aria-labelledby="items" className="mt-10">
        <h2 id="items" className="text-h4">What you ordered</h2>
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[28rem] text-left">
            <thead className="border-b border-line text-sm text-muted"><tr><th scope="col" className="p-3 font-medium">Item</th><th scope="col" className="p-3 text-right font-medium">Qty</th><th scope="col" className="p-3 text-right font-medium">Amount</th></tr></thead>
            <tbody>{order.items.map((i) => <tr key={i.id} className="border-b border-line last:border-0"><td className="p-3 text-ink">{i.title}</td><td className="p-3 text-right">{i.quantity}</td><td className="p-3 text-right">{money(i.unitPrice * i.quantity)}</td></tr>)}</tbody>
            <tfoot className="text-sm">
              {order.discount > 0 ? <tr><td colSpan={2} className="p-3 text-right">Discount</td><td className="p-3 text-right">-{money(order.discount)}</td></tr> : null}
              {order.shipping > 0 ? <tr><td colSpan={2} className="p-3 text-right">Shipping</td><td className="p-3 text-right">{money(order.shipping)}</td></tr> : null}
              {order.tax > 0 ? <tr><td colSpan={2} className="p-3 text-right">Tax</td><td className="p-3 text-right">{money(order.tax)}</td></tr> : null}
              <tr className="border-t border-line text-base font-semibold text-ink"><td colSpan={2} className="p-3 text-right">Total</td><td className="p-3 text-right">{money(order.total)}</td></tr>
              {refunded > 0 ? <tr><td colSpan={2} className="p-3 text-right">Refunded</td><td className="p-3 text-right">{money(refunded)}</td></tr> : null}
            </tfoot>
          </table>
        </div>
      </section>

      {ship?.line1 ? (
        <section aria-labelledby="ship" className="mt-8">
          <h2 id="ship" className="text-h4">Delivery address</h2>
          <address className="mt-2 not-italic text-ink">{[ship.name, ship.line1, ship.line2, [ship.postal, ship.city].filter(Boolean).join(' '), ship.region, ship.country].filter(Boolean).map((l, i) => <span key={i} className="block">{l}</span>)}</address>
        </section>
      ) : null}

      {downloads.length ? (
        <section aria-labelledby="downloads" className="mt-10 rounded-card border border-primary bg-surface p-5">
          <h2 id="downloads" className="text-h4">Your downloads</h2>
          <ul className="mt-3 space-y-4">
            {downloads.map((d) => (
              <li key={d.itemId}>
                <p className="font-medium text-ink">{d.title}</p>
                <ul className="mt-1 space-y-1">{d.files.map((f) => <li key={f.index}><a className="text-primary underline" href={`/download/${token}/${d.itemId}/${f.index}`}>{f.name}</a>{f.limit > 0 ? <span className="ml-2 text-sm text-muted">{Math.max(0, f.limit - f.used)} of {f.limit} downloads left</span> : null}</li>)}</ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {payable ? (
        <section aria-labelledby="pay" className="mt-10 space-y-6">
          <h2 id="pay" className="text-h4">{status === 'FAILED' ? 'Payment did not go through. Try again' : 'Pay for this order'}</h2>
          {instructions ? (
            <div className="rounded-card border border-primary bg-surface p-5">
              <h3 className="text-h5">{instructions.title}</h3>
              <ul className="mt-3 space-y-1">{instructions.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          ) : null}
          {instructions ? <ProofForm token={token} proof={instructions.proof} canUpload={getStorage().configured} resubmit={false} /> : null}
          {methods.length ? (
            <div><h3 className="mb-3 font-medium text-ink">{instructions ? 'Or choose another way to pay' : 'Choose how to pay'}</h3><MethodPicker token={token} methods={methods.map((m) => ({ id: m.def.id, label: m.label, hint: m.def.hint, kind: m.def.kind }))} current={order.methodId} /></div>
          ) : <p>No payment method is available right now. Please contact us.</p>}
        </section>
      ) : null}

      {status === 'VERIFYING' ? (
        <section aria-labelledby="verify" className="mt-10 space-y-6">
          <h2 id="verify" className="text-h4">We are checking your payment</h2>
          <p>Thank you. {submitted ? 'We have your payment details.' : 'Your payment needs a quick check.'} We will email you as soon as it is confirmed.</p>
          {instructions && submitted ? <details><summary className="cursor-pointer text-primary">Send different details</summary><div className="mt-4"><ProofForm token={token} proof={instructions.proof} canUpload={getStorage().configured} resubmit /></div></details> : null}
        </section>
      ) : null}

      {order.invoiceNumber ? (
        <p className="mt-10"><Link href={`/invoice/${token}`} className="btn btn-ghost">Open invoice {order.invoiceNumber}</Link></p>
      ) : null}
      {plan ? <p className="mt-6">This order is part of your plan <strong>{plan.title}</strong>. <Link href={`/subscription/${plan.token}`} className="text-primary underline">Manage your plan</Link></p> : null}

      {updates.length ? (
        <section aria-labelledby="updates" className="mt-12">
          <h2 id="updates" className="text-h4">Updates from us</h2>
          <ol className="mt-4 space-y-4">
            {updates.map((u, i) => (
              <li key={i} className="rounded-card border border-line bg-surface p-4">
                <p className="text-sm text-muted">{formatDay(String(u.at), 'UTC')}</p>
                <p className="mt-1 whitespace-pre-line text-ink">{String(u.text ?? '')}</p>
                {u.fileUrl ? <p className="mt-2"><a className="text-primary underline" href={String(u.fileUrl)} target="_blank" rel="noopener noreferrer">{String(u.fileName || 'Download file')}</a></p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="history" className="mt-12">
        <h2 id="history" className="text-h4">Progress</h2>
        <ol className="mt-4 space-y-2 border-l-2 border-line pl-5">
          {history.filter((h) => h.from !== h.to).map((h, i) => (
            <li key={i} className="relative text-sm"><span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" /><span className="font-medium text-ink">{STATUS_LABEL[String(h.to) as OrderStatusId] ?? String(h.to)}</span> <span className="text-muted">{formatDay(String(h.at), 'UTC')}</span></li>
          ))}
        </ol>
      </section>

      <p className="mt-12 text-sm text-muted">Keep this address private: anyone who has it can see this order.</p>
    </div>
  );
}
