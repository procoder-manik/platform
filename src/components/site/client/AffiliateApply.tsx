'use client';

import { useState, useTransition } from 'react';
import { applyAffiliateAction } from '@/lib/growth/actions';

const field = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink aria-[invalid=true]:border-danger';

/** The affiliate application form. */
export function AffiliateApply() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErrors({});
    setMessage('');
    start(async () => {
      const r = await applyAffiliateAction({ name: String(f.get('name') ?? ''), email: String(f.get('email') ?? ''), website: String(f.get('website') ?? ''), payoutDetails: String(f.get('payout') ?? ''), company: String(f.get('company') ?? '') });
      if (r.ok) return setDone(r.message);
      setErrors(r.errors);
      setMessage(r.message);
    });
  };

  if (done) return <p role="status" className="rounded-card border border-success p-5 text-lg">{done}</p>;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <p role="alert" className="rounded-input border border-danger p-3 text-danger">{message}</p> : null}
      <div><label htmlFor="af-name" className="block font-medium text-ink">Your name</label><input id="af-name" name="name" className={field} autoComplete="name" aria-invalid={Boolean(errors.name)} />{errors.name ? <p className="mt-1 text-sm text-danger">{errors.name}</p> : null}</div>
      <div><label htmlFor="af-email" className="block font-medium text-ink">Email</label><input id="af-email" name="email" type="email" className={field} autoComplete="email" aria-invalid={Boolean(errors.email)} />{errors.email ? <p className="mt-1 text-sm text-danger">{errors.email}</p> : null}</div>
      <div><label htmlFor="af-web" className="block font-medium text-ink">Website or channel (optional)</label><input id="af-web" name="website" className={field} autoComplete="url" /></div>
      <div><label htmlFor="af-pay" className="block font-medium text-ink">How should we pay you? (optional, you can add it later)</label><textarea id="af-pay" name="payout" rows={3} className={`${field} py-2`} /></div>
      <div aria-hidden="true" className="absolute left-[-9999px]"><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Apply'}</button>
    </form>
  );
}
