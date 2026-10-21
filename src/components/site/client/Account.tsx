'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { confirmLinkAction, deleteAccountAction, deleteAddressAction, forgotAction, loginAction, logoutAction, magicLinkAction, passwordAction, profileAction, registerAction, resendVerifyAction, resetAction, saveAddressAction, wishlistAction, type Result } from '@/lib/accounts/actions';

const input = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink aria-[invalid=true]:border-danger';

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium text-ink">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function Notice({ result }: { result: Result | null }) {
  if (!result) return null;
  return <p role={result.ok ? 'status' : 'alert'} className={`rounded-input border p-3 ${result.ok ? 'border-success' : 'border-danger text-danger'}`}>{result.message}</p>;
}

/** Runs a server action, keeps its result and follows a redirect when it asks for one. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      setResult(null);
      const r = await fn();
      setResult(r);
      if (r.ok && r.redirect) {
        window.location.assign(r.redirect);
        return;
      }
      if (r.ok) router.refresh();
      after?.(r);
    });
  const errors = result && !result.ok ? result.errors : {};
  return { pending, result, run, errors };
}

export function LoginForm({ next }: { next?: string }) {
  const { pending, result, run, errors } = useRun();
  const [mode, setMode] = useState<'password' | 'link'>('password');
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="How to sign in" className="flex gap-2 text-sm">
        <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => setMode('password')} className={`rounded-full border px-3 py-1.5 ${mode === 'password' ? 'border-primary text-ink' : 'border-line text-muted'}`}>Password</button>
        <button type="button" role="tab" aria-selected={mode === 'link'} onClick={() => setMode('link')} className={`rounded-full border px-3 py-1.5 ${mode === 'link' ? 'border-primary text-ink' : 'border-line text-muted'}`}>Email me a link</button>
      </div>
      <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const email = String(f.get('email') ?? ''); run(() => (mode === 'password' ? loginAction({ email, password: String(f.get('password') ?? ''), next }) : magicLinkAction({ email }))); }}>
        <Notice result={result} />
        <Field id="li-email" label="Email" error={errors.email}><input id="li-email" name="email" type="email" className={input} autoComplete="email" /></Field>
        {mode === 'password' ? <Field id="li-pw" label="Password" error={errors.login}><input id="li-pw" name="password" type="password" className={input} autoComplete="current-password" /></Field> : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'One moment…' : mode === 'password' ? 'Sign in' : 'Send me a sign-in link'}</button>
      </form>
      <p className="text-sm"><Link href="/account/forgot" className="text-primary underline">Forgot your password?</Link> · <Link href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary underline">Create an account</Link></p>
    </div>
  );
}

export function RegisterForm() {
  const { pending, result, run, errors } = useRun();
  const [done, setDone] = useState(false);
  if (done && result?.ok) return <p role="status" className="rounded-card border border-success p-5 text-lg">{result.message}</p>;
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => registerAction({ name: String(f.get('name') ?? ''), email: String(f.get('email') ?? ''), password: String(f.get('password') ?? ''), company: String(f.get('company') ?? '') }), (r) => setDone(r.ok)); }}>
      {result && !result.ok ? <Notice result={result} /> : null}
      <Field id="rg-name" label="Your name" error={errors.name}><input id="rg-name" name="name" className={input} autoComplete="name" /></Field>
      <Field id="rg-email" label="Email" error={errors.email}><input id="rg-email" name="email" type="email" className={input} autoComplete="email" /></Field>
      <Field id="rg-pw" label="Password" error={errors.password} hint="At least 10 characters."><input id="rg-pw" name="password" type="password" className={input} autoComplete="new-password" /></Field>
      <div aria-hidden="true" className="absolute left-[-9999px]"><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</button>
      <p className="text-sm">Already have an account? <Link href="/account/login" className="text-primary underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const { pending, result, run, errors } = useRun();
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => forgotAction({ email: String(new FormData(e.currentTarget).get('email') ?? '') })); }}>
      <Notice result={result} />
      <Field id="fg-email" label="Email" error={errors.email}><input id="fg-email" name="email" type="email" className={input} autoComplete="email" /></Field>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Send me a reset link'}</button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { pending, result, run, errors } = useRun();
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => resetAction({ token, password: String(new FormData(e.currentTarget).get('password') ?? '') })); }}>
      <Notice result={result} />
      <Field id="rs-pw" label="New password" error={errors.password} hint="At least 10 characters."><input id="rs-pw" name="password" type="password" className={input} autoComplete="new-password" /></Field>
      {errors.token ? <p className="text-sm"><Link href="/account/forgot" className="text-primary underline">Ask for a new link</Link></p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}

/** The button on an emailed link. The link itself does nothing until it is pressed, so mail scanners cannot use it up. */
export function ConfirmLink({ kind, token }: { kind: 'verify' | 'magic'; token: string }) {
  const { pending, result, run } = useRun();
  return (
    <div className="space-y-4">
      <Notice result={result} />
      <button type="button" className="btn btn-primary" disabled={pending || Boolean(result?.ok)} onClick={() => run(() => confirmLinkAction(kind, token))}>{pending ? 'One moment…' : kind === 'verify' ? 'Confirm my email address' : 'Sign in'}</button>
    </div>
  );
}

export function SignOutButton() {
  const { pending, run } = useRun();
  return <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => logoutAction())}>Sign out</button>;
}

export function ResendVerify() {
  const { pending, result, run } = useRun();
  return (
    <span>
      <button type="button" className="text-primary underline" disabled={pending} onClick={() => run(() => resendVerifyAction())}>Send the link again</button>
      {result ? <span role="status" className="ml-2 text-sm">{result.message}</span> : null}
    </span>
  );
}

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const { pending, result, run, errors } = useRun();
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => profileAction({ name: String(f.get('name') ?? ''), phone: String(f.get('phone') ?? '') })); }}>
      <Notice result={result} />
      <Field id="pf-name" label="Name" error={errors.name}><input id="pf-name" name="name" defaultValue={name} className={input} autoComplete="name" /></Field>
      <Field id="pf-email" label="Email" hint="To change your email address, contact us."><input id="pf-email" value={email} readOnly className={`${input} bg-raised`} /></Field>
      <Field id="pf-phone" label="Phone (optional)" error={errors.phone}><input id="pf-phone" name="phone" defaultValue={phone} className={input} autoComplete="tel" /></Field>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}

export function PasswordForm() {
  const { pending, result, run, errors } = useRun();
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { const form = e.currentTarget; e.preventDefault(); const f = new FormData(form); run(() => passwordAction({ current: String(f.get('current') ?? ''), password: String(f.get('password') ?? '') }), (r) => r.ok && form.reset()); }}>
      <Notice result={result} />
      <Field id="pw-cur" label="Current password" error={errors.current}><input id="pw-cur" name="current" type="password" className={input} autoComplete="current-password" /></Field>
      <Field id="pw-new" label="New password" error={errors.password} hint="At least 10 characters."><input id="pw-new" name="password" type="password" className={input} autoComplete="new-password" /></Field>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

export function DeleteAccountForm() {
  const { pending, result, run, errors } = useRun();
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!window.confirm('Delete your account for good? This cannot be undone.')) return; run(() => deleteAccountAction({ password: String(new FormData(e.currentTarget).get('password') ?? '') })); }}>
      <Notice result={result} />
      <p>This deletes your saved addresses and wishlist and signs you out everywhere. Your orders and invoices are kept, because we must keep them, but they will no longer be linked to an account.</p>
      <Field id="del-pw" label="Your password" error={errors.password}><input id="del-pw" name="password" type="password" className={input} autoComplete="current-password" /></Field>
      <button type="submit" className="btn btn-ghost text-danger" disabled={pending}>{pending ? 'Deleting…' : 'Delete my account'}</button>
    </form>
  );
}

interface Addr { id: string; label: string | null; name: string; line1: string; line2: string; city: string; region: string; postal: string; country: string; phone: string; isDefault: boolean }

export function AddressManager({ addresses, countries }: { addresses: Addr[]; countries: { code: string; name: string }[] }) {
  const { pending, result, run, errors } = useRun();
  const [editing, setEditing] = useState<Addr | 'new' | null>(null);
  const blank: Addr = { id: '', label: '', name: '', line1: '', line2: '', city: '', region: '', postal: '', country: '', phone: '', isDefault: addresses.length === 0 };
  const current = editing === 'new' ? blank : editing;
  const countryName = (c: string) => countries.find((x) => x.code === c)?.name ?? c;
  return (
    <div className="space-y-6">
      <Notice result={result} />
      <ul className="grid gap-4 sm:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className="rounded-card border border-line bg-surface p-4">
            <p className="font-medium text-ink">{a.label || a.name}{a.isDefault ? <span className="ml-2 rounded-full border border-primary px-2 text-xs">Default</span> : null}</p>
            <address className="mt-1 text-sm not-italic">{[a.name, a.line1, a.line2, [a.postal, a.city].filter(Boolean).join(' '), a.region, countryName(a.country), a.phone].filter(Boolean).map((l, i) => <span key={i} className="block">{l}</span>)}</address>
            <p className="mt-3 flex gap-4 text-sm"><button type="button" className="text-primary underline" onClick={() => setEditing(a)}>Edit</button><button type="button" className="text-primary underline" disabled={pending} onClick={() => window.confirm('Delete this address?') && run(() => deleteAddressAction(a.id))}>Delete</button></p>
          </li>
        ))}
      </ul>
      {addresses.length === 0 && !editing ? <p className="text-muted">You have no saved addresses.</p> : null}
      {!editing ? <button type="button" className="btn btn-ghost" onClick={() => setEditing('new')}>Add an address</button> : null}
      {current ? (
        <form key={current.id || 'new'} noValidate className="space-y-4 rounded-card border border-line bg-surface p-5" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const g = (k: string) => String(f.get(k) ?? ''); run(() => saveAddressAction({ id: current.id || undefined, label: g('label'), isDefault: f.get('isDefault') === 'on', address: { name: g('name'), line1: g('line1'), line2: g('line2'), city: g('city'), region: g('region'), postal: g('postal'), country: g('country'), phone: g('phone') } }), (r) => r.ok && setEditing(null)); }}>
          <h2 className="text-h5">{current.id ? 'Edit address' : 'New address'}</h2>
          <Field id="ad-label" label="Label (optional)"><input id="ad-label" name="label" defaultValue={current.label ?? ''} className={input} placeholder="Home, Office" /></Field>
          <Field id="ad-name" label="Name on the parcel" error={errors.name}><input id="ad-name" name="name" defaultValue={current.name} className={input} autoComplete="name" /></Field>
          <Field id="ad-l1" label="Street address" error={errors.line1}><input id="ad-l1" name="line1" defaultValue={current.line1} className={input} autoComplete="address-line1" /></Field>
          <Field id="ad-l2" label="Apartment, suite (optional)"><input id="ad-l2" name="line2" defaultValue={current.line2} className={input} autoComplete="address-line2" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ad-city" label="City" error={errors.city}><input id="ad-city" name="city" defaultValue={current.city} className={input} autoComplete="address-level2" /></Field>
            <Field id="ad-region" label="State or region (optional)"><input id="ad-region" name="region" defaultValue={current.region} className={input} autoComplete="address-level1" /></Field>
            <Field id="ad-postal" label="Postal code (optional)"><input id="ad-postal" name="postal" defaultValue={current.postal} className={input} autoComplete="postal-code" /></Field>
            <Field id="ad-country" label="Country" error={errors.country}><select id="ad-country" name="country" defaultValue={current.country} className={input}><option value="">Choose…</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
          </div>
          <Field id="ad-phone" label="Phone" error={errors.phone}><input id="ad-phone" name="phone" defaultValue={current.phone} className={input} autoComplete="tel" /></Field>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="isDefault" defaultChecked={current.isDefault} className="h-4 w-4 accent-primary" />Use as my default address</label>
          <div className="flex gap-3"><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save address'}</button><button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      ) : null}
    </div>
  );
}

/** A heart button. When nobody is signed in it leads to the sign-in page and brings them back. */
export function WishlistButton({ productId, saved, signedIn, next }: { productId: string; saved: boolean; signedIn: boolean; next: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(saved);
  const [message, setMessage] = useState('');
  return (
    <div>
      <button type="button" aria-pressed={on} disabled={pending} className="btn btn-ghost" onClick={() => start(async () => {
        setMessage('');
        if (!signedIn) { router.push(`/account/login?next=${encodeURIComponent(next)}`); return; }
        const r = await wishlistAction(productId);
        if (r.ok) { setOn(Boolean(r.saved)); router.refresh(); } else setMessage(r.message);
      })}>{on ? '♥ Saved to wishlist' : '♡ Save to wishlist'}</button>
      {message ? <p role="alert" className="mt-2 text-sm text-danger">{message}</p> : null}
    </div>
  );
}
