import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatMinor } from '@/lib/checkout/money';
import { getOrderByToken } from '@/lib/checkout/orders';
import { paymentSettings } from '@/lib/checkout/settings';
import { getSetting } from '@/lib/data';
import { PrintButton } from '@/components/site/client/PrintButton';
import { getMethod } from '@/lib/checkout/methods';
import { siteSettings } from '@/modules/core/settings';
import { brandSettings } from '@/lib/theme/brand';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false, nocache: true } };

const date = (d: Date | string | null) => (d ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(d)) : '');

/** A printable invoice, available once the order is paid. Reached with the order token. */
export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const order = await getOrderByToken((await params).token);
  if (!order || !order.invoiceNumber) notFound();
  const [pay, site, brand] = await Promise.all([getSetting(paymentSettings), getSetting(siteSettings), getSetting(brandSettings)]);
  const money = (n: number) => formatMinor(n, order.currency);
  const customer = (order.customer ?? {}) as { name?: string; phone?: string };
  const company = pay.companyName || site.siteName;
  const method = order.methodId ? (getMethod(order.methodId)?.label ?? order.methodId) : '';
  const requirements = (Array.isArray(order.requirements) ? order.requirements : []) as { label: string; value: string }[];
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden"><PrintButton /></div>
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {brand.logoLight ? <img src={brand.logoLight} alt={company} className="mb-3 h-10 w-auto" /> : null}
          <p className="text-lg font-semibold text-ink">{company}</p>
          {pay.companyAddress ? <p className="mt-1 whitespace-pre-line text-sm">{pay.companyAddress}</p> : null}
          {pay.taxId ? <p className="mt-1 text-sm">Tax number: {pay.taxId}</p> : null}
        </div>
        <div className="text-right">
          <h1 className="text-h3">Invoice</h1>
          <p className="mt-1 font-mono text-sm">{order.invoiceNumber}</p>
          <p className="text-sm">Date: {date(order.paidAt ?? order.createdAt)}</p>
          <p className="text-sm">Order: {order.number}</p>
        </div>
      </header>
      <section className="mt-6 grid gap-6 sm:grid-cols-2" aria-label="Billed to">
        <div><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Billed to</h2><p className="mt-1 text-ink">{customer.name}</p><p className="text-sm">{order.email}</p>{customer.phone ? <p className="text-sm">{customer.phone}</p> : null}</div>
        <div><h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Payment</h2><p className="mt-1 text-ink">Paid{order.paidAt ? ` on ${date(order.paidAt)}` : ''}</p>{method ? <p className="text-sm">By {method}</p> : null}</div>
      </section>
      <table className="mt-8 w-full text-left">
        <thead className="border-b border-line text-sm text-muted"><tr><th scope="col" className="py-2 font-medium">Description</th><th scope="col" className="py-2 text-right font-medium">Qty</th><th scope="col" className="py-2 text-right font-medium">Price</th><th scope="col" className="py-2 text-right font-medium">Amount</th></tr></thead>
        <tbody>{order.items.map((i) => <tr key={i.id} className="border-b border-line"><td className="py-3 text-ink">{i.title}</td><td className="py-3 text-right">{i.quantity}</td><td className="py-3 text-right">{money(i.unitPrice)}</td><td className="py-3 text-right">{money(i.unitPrice * i.quantity)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={3} className="pt-4 text-right">Subtotal</td><td className="pt-4 text-right">{money(order.subtotal)}</td></tr>
          {order.discount > 0 ? <tr><td colSpan={3} className="text-right">Discount</td><td className="text-right">-{money(order.discount)}</td></tr> : null}
          {order.shipping > 0 ? <tr><td colSpan={3} className="text-right">Shipping</td><td className="text-right">{money(order.shipping)}</td></tr> : null}
          {order.tax > 0 ? <tr><td colSpan={3} className="text-right">{pay.taxLabel} {pay.taxRatePct}%{pay.taxInclusive ? ' (included in the prices)' : ''}</td><td className="text-right">{money(order.tax)}</td></tr> : null}
          <tr className="text-lg font-semibold text-ink"><td colSpan={3} className="pt-2 text-right">Total</td><td className="pt-2 text-right">{money(order.total)}</td></tr>
        </tfoot>
      </table>
      {requirements.length ? <section className="mt-8 text-sm" aria-label="Project details"><h2 className="font-semibold text-ink">Project details</h2><dl className="mt-2 space-y-1">{requirements.map((r) => <div key={r.label}><dt className="inline text-muted">{r.label}: </dt><dd className="inline">{r.value}</dd></div>)}</dl></section> : null}
      {pay.invoiceFooter ? <p className="mt-10 border-t border-line pt-4 text-sm">{pay.invoiceFooter}</p> : null}
    </article>
  );
}
