'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { placeStoreOrderAction, quoteAction } from '@/lib/store/actions';
import type { Basket } from '@/lib/store/engine';
import { formatMinor } from '@/lib/checkout/money';

interface Props {
  initial: Basket;
  countries: { code: string; name: string }[];
  methods: { id: string; label: string; hint: string; kind: string }[];
  terms: { required: boolean; href: string };
  taxLabel: string;
  initialCode?: string;
  prefill?: { name: string; email: string; phone: string };
  saved?: { id: string; label: string | null; name: string; line1: string; line2: string; city: string; region: string; postal: string; country: string; phone: string; isDefault: boolean }[];
}

const field = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink';

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium text-ink">{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/** Cart checkout: buyer, delivery address, shipping method and payment. Totals are always the server's. */
export function StoreCheckoutForm({ initial, countries, methods, terms, taxLabel, initialCode = '', prefill, saved = [] }: Props) {
  const first = saved.find((a) => a.isDefault) ?? saved[0];
  const [code, setCode] = useState(initialCode);
  const [appliedCode, setAppliedCode] = useState(initialCode);
  const [basket, setBasket] = useState<Basket>(initial);
  const [name, setName] = useState(prefill?.name ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [phone, setPhone] = useState(first?.phone ?? prefill?.phone ?? '');
  const [addr, setAddr] = useState({ name: first?.name ?? '', line1: first?.line1 ?? '', line2: first?.line2 ?? '', city: first?.city ?? '', region: first?.region ?? '', postal: first?.postal ?? '', country: first?.country ?? '' });
  const [billingCountry, setBillingCountry] = useState('');
  const [rateId, setRateId] = useState<string | null>(null);
  const [method, setMethod] = useState(methods[0]?.id ?? '');
  const [accepted, setAccepted] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const seq = useRef(0);

  const address = basket.needsShipping ? { ...addr, name: addr.name || name, phone } : undefined;
  const country = basket.needsShipping ? addr.country : billingCountry;

  // Ask the server again whenever something that changes the price changes: country and shipping method.
  useEffect(() => {
    const mine = (seq.current += 1);
    void (async () => {
      const r = await quoteAction({ address: basket.needsShipping && addr.country ? { ...addr, name: addr.name || name || 'x', line1: addr.line1 || 'x', city: addr.city || 'x', phone: phone || '000000' } : undefined, billingCountry: basket.needsShipping ? undefined : billingCountry || undefined, shippingRateId: rateId, code: appliedCode || undefined, email: email || undefined });
      if (mine !== seq.current || !r.ok) return;
      setBasket(r.basket);
      if (rateId && !r.basket.rates.some((x) => x.id === rateId)) setRateId(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, rateId, appliedCode]);

  const money = (n: number) => formatMinor(n, basket.currency);
  const blocking = basket.problems.filter((p) => !(basket.needsShipping && !addr.country && (p === 'Choose a shipping method.')));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setMessage('');
    start(async () => {
      const r = await placeStoreOrderAction({ name, email, phone, address, billingCountry: basket.needsShipping ? undefined : billingCountry || undefined, shippingRateId: rateId, code: appliedCode || undefined, method, acceptTerms: accepted, website });
      if (!r.ok) {
        setMessage(r.message);
        setErrors(r.errors);
        return;
      }
      window.location.assign(r.redirect);
    });
  };

  return (
    <div className="mx-auto grid max-w-shell gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1fr_24rem] lg:py-20">
      <form onSubmit={submit} noValidate className="space-y-8">
        <div><h1>Checkout</h1><p className="mt-2"><Link href="/cart" className="text-primary underline">Back to your cart</Link></p></div>
        {message ? <p role="alert" className="rounded-input border border-danger p-3 text-danger">{message}</p> : null}
        {blocking.length ? <ul role="alert" className="space-y-1 rounded-input border border-warning p-3">{blocking.map((p) => <li key={p}>{p}</li>)}</ul> : null}

        <fieldset className="space-y-4">
          <legend className="text-h4">Your details</legend>
          <Field id="name" label="Full name" error={errors.name}><input id="name" className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} /></Field>
          <Field id="email" label="Email" error={errors.email}><input id="email" type="email" className={field} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} /></Field>
          <Field id="phone" label={basket.needsShipping ? 'Phone (for the courier)' : 'Phone (optional)'} error={errors.phone}><input id="phone" type="tel" className={field} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <div aria-hidden="true" className="absolute left-[-9999px]"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
        </fieldset>

        {basket.needsShipping ? (
          <fieldset className="space-y-4">
            <legend className="text-h4">Delivery address</legend>
            {saved.length ? (
              <Field id="a-saved" label="Use a saved address">
                <select id="a-saved" className={field} defaultValue={first?.id ?? ''} onChange={(e) => { const a = saved.find((x) => x.id === e.target.value); if (!a) return; setRateId(null); setPhone(a.phone); setAddr({ name: a.name, line1: a.line1, line2: a.line2, city: a.city, region: a.region, postal: a.postal, country: a.country }); }}>
                  <option value="">Enter a new address</option>
                  {saved.map((a) => <option key={a.id} value={a.id}>{a.label || a.name}, {a.line1}, {a.city}</option>)}
                </select>
              </Field>
            ) : null}
            <Field id="a-name" label="Name on the parcel" error={errors.name}><input id="a-name" className={field} autoComplete="shipping name" value={addr.name} placeholder={name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} /></Field>
            <Field id="a-line1" label="Street address" error={errors.line1}><input id="a-line1" className={field} autoComplete="shipping address-line1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} /></Field>
            <Field id="a-line2" label="Apartment, suite (optional)"><input id="a-line2" className={field} autoComplete="shipping address-line2" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="a-city" label="City" error={errors.city}><input id="a-city" className={field} autoComplete="shipping address-level2" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} /></Field>
              <Field id="a-region" label="State or region (optional)"><input id="a-region" className={field} autoComplete="shipping address-level1" value={addr.region} onChange={(e) => setAddr({ ...addr, region: e.target.value })} /></Field>
              <Field id="a-postal" label="Postal code (optional)"><input id="a-postal" className={field} autoComplete="shipping postal-code" value={addr.postal} onChange={(e) => setAddr({ ...addr, postal: e.target.value })} /></Field>
              <Field id="a-country" label="Country" error={errors.country}>
                <select id="a-country" className={field} autoComplete="shipping country" value={addr.country} onChange={(e) => { setRateId(null); setAddr({ ...addr, country: e.target.value }); }}>
                  <option value="">Choose…</option>
                  {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            {addr.country ? (
              <div>
                <p className="font-medium text-ink">Shipping method</p>
                {basket.rates.length === 0 ? <p className="mt-2 text-danger">We do not ship to that country.</p> : (
                  <ul className="mt-2 space-y-2">
                    {basket.rates.map((r) => (
                      <li key={r.id}><label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-card border border-line p-3 has-[:checked]:border-primary"><input type="radio" name="rate" value={r.id} checked={rateId === r.id} onChange={() => setRateId(r.id)} className="h-4 w-4 accent-primary" /><span className="flex-1">{r.name}</span><span className="font-medium text-ink">{r.price === 0 ? 'Free' : money(r.price)}</span></label></li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </fieldset>
        ) : (
          <fieldset className="space-y-4">
            <legend className="text-h4">Billing country</legend>
            <Field id="bc" label="Country" error={errors.billingCountry}>
              <select id="bc" className={field} value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)}>
                <option value="">Choose…</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <p className="text-sm text-muted">Digital products have no shipping. Your country decides the tax.</p>
          </fieldset>
        )}

        <fieldset className="space-y-2">
          <legend className="text-h4">Discount or referral code</legend>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-ink">Code<input className="mt-1 block min-h-11 w-56 rounded-input border border-line bg-surface px-3 text-ink" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} /></label>
            <button type="button" className="btn btn-ghost" onClick={() => setAppliedCode(code.trim())}>Apply</button>
          </div>
          {basket.discount ? <p role="status" className="text-sm text-success">{basket.discount.label}</p> : null}
          {errors.code ? <p role="alert" className="text-sm text-danger">{errors.code}</p> : null}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-h4">Payment</legend>
          {methods.map((m) => (
            <label key={m.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-card border border-line p-4 has-[:checked]:border-primary has-[:checked]:bg-raised">
              <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="mt-1 h-4 w-4 accent-primary" />
              <span><span className="block font-medium text-ink">{m.kind === 'automatic' ? `Pay with ${m.label}` : m.label}</span><span className="block text-sm">{m.hint}</span></span>
            </label>
          ))}
          {errors.method ? <p className="text-sm text-danger">{errors.method}</p> : null}
        </fieldset>

        {terms.required ? (
          <div>
            <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /><span>I accept the {terms.href ? <a href={terms.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">terms</a> : 'terms'}.</span></label>
            {errors.acceptTerms ? <p className="mt-1 text-sm text-danger">{errors.acceptTerms}</p> : null}
          </div>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={pending || blocking.length > 0}>{pending ? 'Placing your order…' : `Place order and pay ${money(basket.totals.total)}`}</button>
      </form>

      <aside aria-labelledby="summary" className="h-fit rounded-card border border-line bg-surface p-5 lg:sticky lg:top-24">
        <h2 id="summary" className="text-h5">Order summary</h2>
        <ul className="mt-4 space-y-3">
          {basket.lines.map((l) => <li key={l.variantId} className="flex justify-between gap-3 text-sm"><span>{l.title}{l.quantity > 1 ? ` × ${l.quantity}` : ''}</span><span className="text-ink">{money(l.amount)}</span></li>)}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(basket.totals.subtotal)}</dd></div>
          {basket.totals.discount > 0 ? <div className="flex justify-between text-success"><dt>Discount</dt><dd>-{money(basket.totals.discount)}</dd></div> : null}
          {basket.needsShipping ? <div className="flex justify-between"><dt>Shipping</dt><dd>{basket.chosenRate ? (basket.totals.shipping === 0 ? 'Free' : money(basket.totals.shipping)) : 'Choose a method'}</dd></div> : null}
          {basket.totals.tax > 0 ? <div className="flex justify-between"><dt>{taxLabel}{basket.inclusive ? ' (included)' : ''}</dt><dd>{money(basket.totals.tax)}</dd></div> : null}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink"><dt>Total</dt><dd>{money(basket.totals.total)}</dd></div>
        </dl>
      </aside>
    </div>
  );
}
