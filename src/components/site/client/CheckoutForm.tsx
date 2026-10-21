'use client';

import { useRef, useState, useTransition, type ReactNode } from 'react';
import { placeOrderAction, previewCodeAction } from '@/lib/checkout/actions';
import { formatMinor } from '@/lib/checkout/money';
import { PERIOD_LABEL, allowedPeriods, computeTotals, quantityFor, quoteFor, type PackagePricing, type Period } from '@/lib/checkout/pricing';

interface Props {
  pkg: PackagePricing & { slug: string; name: string; tagline: string | null; serviceName: string; currency: string; deliveryDays: number | null; features: string[] };
  requirements: { label: string; kind: string; required?: boolean; options?: string[] }[];
  methods: { id: string; label: string; hint: string; kind: string }[];
  tax: { ratePct: number; inclusive: boolean; label: string };
  terms: { required: boolean; href: string };
  initialPeriod: Period;
  /** Shown for recurring plans when the Subscriptions module is on: how renewals work. */
  recurringNote?: string | null;
  /** A code to try straight away, for example from a friend's referral link. */
  initialCode?: string;
  /** Details of a signed-in customer, to save typing. */
  prefill?: { name: string; email: string; phone: string };
}

const field = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink aria-[invalid=true]:border-danger';

function Field({ label, error, children, id }: { label: string; error?: string; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium text-ink">{label}</label>
      {children}
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/** The checkout form. The summary is for display; the server recomputes the price from the package. */
export function CheckoutForm({ pkg, requirements, methods, tax, terms, initialPeriod, recurringNote, initialCode = '', prefill }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState(initialCode);
  const [applied, setApplied] = useState<{ key: string; discount: number; label: string } | null>(null);
  const [codeMessage, setCodeMessage] = useState('');
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [hours, setHours] = useState(1);
  const [method, setMethod] = useState(methods[0]?.id ?? '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();

  const periods = allowedPeriods(pkg);
  const quote = quoteFor(pkg, period);
  const quantity = quantityFor(pkg.billing, hours);
  const priceKey = `${period}:${quantity}`;
  const discount = applied && applied.key === priceKey ? applied.discount : 0;
  const totals = computeTotals({ subtotal: quote.unit * quantity, discount, taxRatePct: tax.ratePct, taxInclusive: tax.inclusive });
  const money = (n: number) => formatMinor(n, pkg.currency);

  function applyCode() {
    setCodeMessage('');
    setApplied(null);
    if (!code.trim()) return;
    const email = String(new FormData(formRef.current ?? undefined).get('email') ?? '');
    start(async () => {
      const r = await previewCodeAction({ package: pkg.slug, period: period === 'once' ? undefined : period, quantity: pkg.billing === 'HOURLY' ? quantity : undefined, code, email });
      if (r.ok) setApplied({ key: priceKey, discount: r.discount, label: r.label });
      else setCodeMessage(r.message);
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setErrors({});
    setMessage('');
    start(async () => {
      const result = await placeOrderAction({
        package: pkg.slug,
        period: period === 'once' ? undefined : period,
        quantity: pkg.billing === 'HOURLY' ? quantity : undefined,
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? ''),
        requirements: answers,
        method,
        acceptTerms: terms.required ? accept : undefined,
        website: String(form.get('website') ?? ''),
        code: code.trim() || undefined,
      });
      if (result.ok) {
        window.location.assign(result.redirect);
        return;
      }
      setErrors(result.errors);
      setMessage(result.message);
    });
  }

  return (
    <div className="mx-auto grid max-w-shell gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1fr_22rem] lg:py-20">
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-8">
        <div>
          <h1>Checkout</h1>
          <p className="mt-2">You are ordering {pkg.serviceName}: {pkg.name}.</p>
          {recurringNote ? <p className="mt-3 rounded-input border border-line p-3 text-sm">{recurringNote}</p> : null}
        </div>

        {periods.length > 1 ? (
          <fieldset>
            <legend className="font-medium text-ink">Billing</legend>
            <div className="mt-2 inline-flex rounded-button border border-line p-0.5" role="radiogroup">
              {periods.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={`min-h-10 rounded-button px-4 ${period === p ? 'bg-primary text-primary-ink' : 'text-ink'}`}>
                  {p === 'yearly' ? 'Yearly' : 'Monthly'}
                </button>
              ))}
            </div>
            {errors.period ? <p className="mt-1 text-sm text-danger">{errors.period}</p> : null}
          </fieldset>
        ) : null}

        {pkg.billing === 'HOURLY' ? (
          <Field label="Number of hours" id="hours">
            <input id="hours" type="number" min={1} max={1000} className={field} value={hours} onChange={(e) => setHours(Math.max(1, Math.min(1000, Math.floor(Number(e.target.value) || 1))))} />
          </Field>
        ) : null}

        <section aria-labelledby="you" className="space-y-4">
          <h2 id="you" className="text-h4">Your details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" id="name" error={errors.name}><input id="name" name="name" required defaultValue={prefill?.name} autoComplete="name" className={field} aria-invalid={Boolean(errors.name)} /></Field>
            <Field label="Email" id="email" error={errors.email}><input id="email" name="email" type="email" required defaultValue={prefill?.email} autoComplete="email" className={field} aria-invalid={Boolean(errors.email)} /></Field>
            <Field label="Phone (optional)" id="phone"><input id="phone" name="phone" type="tel" defaultValue={prefill?.phone} autoComplete="tel" className={field} /></Field>
          </div>
          <label className="sr-only" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </section>

        {requirements.length ? (
          <section aria-labelledby="req" className="space-y-4">
            <h2 id="req" className="text-h4">About your project</h2>
            {requirements.map((r, i) => {
              const id = `req-${i}`;
              const value = answers[r.label] ?? '';
              const error = errors[`req:${r.label}`];
              const set = (v: string) => setAnswers((a) => ({ ...a, [r.label]: v }));
              return (
                <Field key={r.label} id={id} label={`${r.label}${r.required ? '' : ' (optional)'}`} error={error}>
                  {r.kind === 'select' ? (
                    <select id={id} className={field} value={value} onChange={(e) => set(e.target.value)} aria-invalid={Boolean(error)}><option value="">Choose…</option>{(r.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                  ) : r.kind === 'textarea' ? (
                    <textarea id={id} rows={4} className={`${field} py-2`} value={value} onChange={(e) => set(e.target.value)} aria-invalid={Boolean(error)} />
                  ) : (
                    <input id={id} className={field} value={value} onChange={(e) => set(e.target.value)} aria-invalid={Boolean(error)} />
                  )}
                </Field>
              );
            })}
          </section>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-h4 font-display font-semibold text-ink">Payment method</legend>
          {methods.map((m) => (
            <label key={m.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-4 ${method === m.id ? 'border-primary bg-raised' : 'border-line'}`}>
              <input type="radio" name="method" className="mt-1 h-4 w-4 accent-primary" checked={method === m.id} onChange={() => setMethod(m.id)} />
              <span><span className="block font-medium text-ink">{m.label}</span><span className="block text-sm">{m.hint}</span></span>
            </label>
          ))}
          {errors.method ? <p className="text-sm text-danger">{errors.method}</p> : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-h4">Discount or referral code</legend>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-ink">Code<input className="mt-1 block min-h-11 w-56 rounded-input border border-line bg-surface px-3 text-ink" value={code} onChange={(e) => { setCode(e.target.value); setApplied(null); setCodeMessage(''); }} autoComplete="off" spellCheck={false} /></label>
            <button type="button" className="btn btn-ghost" disabled={pending || !code.trim()} onClick={applyCode}>Apply</button>
          </div>
          {applied && discount > 0 ? <p role="status" className="text-sm text-success">{applied.label}</p> : null}
          {codeMessage || errors.code ? <p role="alert" className="text-sm text-danger">{codeMessage || errors.code}</p> : null}
        </fieldset>

        {terms.required ? (
          <div>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-primary" checked={accept} onChange={(e) => setAccept(e.target.checked)} aria-invalid={Boolean(errors.acceptTerms)} />
              <span>I accept the {terms.href ? <a className="text-primary underline" href={terms.href} target="_blank" rel="noreferrer">terms</a> : 'terms'}.</span>
            </label>
            {errors.acceptTerms ? <p className="mt-1 text-sm text-danger">{errors.acceptTerms}</p> : null}
          </div>
        ) : null}

        {message ? <p role="alert" className="rounded-input border border-danger p-3 text-danger">{message}</p> : null}
        <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={pending}>{pending ? 'Placing your order…' : `Place order, ${money(totals.total)}`}</button>
      </form>

      <aside aria-label="Order summary" className="h-fit rounded-card border border-line bg-surface p-6 lg:sticky lg:top-24">
        <h2 className="text-h5">Order summary</h2>
        <p className="mt-3 font-medium text-ink">{pkg.name}</p>
        {pkg.tagline ? <p className="text-sm">{pkg.tagline}</p> : null}
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>{quantity > 1 ? `${quantity} hours at ${money(quote.unit)}` : PERIOD_LABEL[period]}</dt><dd className="text-ink">{money(totals.subtotal)}</dd></div>
          {quote.saving ? <div className="flex justify-between text-success"><dt>You save {quote.saving.pct}%</dt><dd>{money(quote.saving.amount)}</dd></div> : null}
          {totals.discount > 0 ? <div className="flex justify-between text-success"><dt>Discount</dt><dd>-{money(totals.discount)}</dd></div> : null}
          {tax.ratePct > 0 ? <div className="flex justify-between"><dt>{tax.label} {tax.ratePct}%{tax.inclusive ? ' (included)' : ''}</dt><dd>{money(totals.tax)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink"><dt>Total</dt><dd>{money(totals.total)}</dd></div>
        </dl>
        {pkg.deliveryDays ? <p className="mt-4 text-sm text-muted">Ready in {pkg.deliveryDays} days.</p> : null}
        {pkg.features.length ? <ul className="mt-4 space-y-1 text-sm">{pkg.features.slice(0, 6).map((f) => <li key={f}>✓ {f}</li>)}</ul> : null}
        <p className="mt-4 text-xs text-muted">The price is set by us and checked again when you order.</p>
      </aside>
    </div>
  );
}
