'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { payOrderAction, signProofAction, submitPaymentAction } from '@/lib/checkout/actions';

const field = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink';

/** While a payment is being confirmed, refresh the page every few seconds for a minute. */
export function PendingPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 15) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export interface MethodChoice {
  id: string;
  label: string;
  hint: string;
  kind: string;
}

/** Choose how to pay. Card and wallet methods go to the gateway; manual methods show instructions on this page. */
export function MethodPicker({ token, methods, current }: { token: string; methods: MethodChoice[]; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  return (
    <div>
      <ul className="space-y-3">
        {methods.map((m) => (
          <li key={m.id}>
            <button type="button" disabled={pending} aria-pressed={current === m.id && m.kind === 'manual'} onClick={() => start(async () => {
              setMessage('');
              const r = await payOrderAction(token, m.id);
              if (!r.ok) return setMessage(r.message);
              if (/^https?:\/\//.test(r.redirect) && new URL(r.redirect).origin !== location.origin) window.location.assign(r.redirect);
              else router.refresh();
            })} className={`flex min-h-14 w-full items-start gap-3 rounded-card border p-4 text-left ${current === m.id && m.kind === 'manual' ? 'border-primary bg-raised' : 'border-line hover:bg-raised'}`}>
              <span><span className="block font-medium text-ink">{m.kind === 'automatic' ? `Pay with ${m.label}` : m.label}</span><span className="block text-sm">{m.hint}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {message ? <p role="alert" className="mt-3 rounded-input border border-danger p-3 text-danger">{message}</p> : null}
    </div>
  );
}

/** After paying by a manual method: send the transaction ID and, for bank-type methods, a receipt. */
export function ProofForm({ token, proof, canUpload, resubmit }: { token: string; proof: 'transaction' | 'upload'; canUpload: boolean; resubmit: boolean }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const chosen = file.current?.files?.[0];
    setErrors({});
    setMessage('');
    start(async () => {
      let uploaded: { key: string; mime: string; size: number } | undefined;
      if (chosen) {
        const signed = await signProofAction(token, chosen.type, chosen.size);
        if (!signed.ok) return setMessage(signed.message);
        const u = signed.upload;
        let sent: Response;
        if (u.method === 'POST') {
          const body = new FormData();
          for (const [k, v] of Object.entries(u.fields ?? {})) body.append(k, v);
          body.append('file', chosen);
          sent = await fetch(u.url, { method: 'POST', body });
        } else sent = await fetch(u.url, { method: 'PUT', headers: u.headers, body: chosen });
        if (!sent.ok) return setMessage('The receipt could not be uploaded. Try again, or enter the transaction reference instead.');
        uploaded = { key: u.key, mime: chosen.type, size: chosen.size };
      }
      const r = await submitPaymentAction(token, { transactionId: String(form.get('transactionId') ?? '') || undefined, senderNumber: String(form.get('senderNumber') ?? '') || undefined, note: String(form.get('note') ?? '') || undefined, proof: uploaded });
      if (!r.ok) {
        setErrors(r.errors);
        return setMessage(r.message);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h3 className="text-h5">{resubmit ? 'Send your payment details again' : 'I have paid'}</h3>
      <div>
        <label htmlFor="tx" className="block font-medium text-ink">Transaction ID{proof === 'upload' ? ' or reference (optional)' : ''}</label>
        <input id="tx" name="transactionId" autoComplete="off" className={field} aria-invalid={Boolean(errors.transactionId)} />
        {errors.transactionId ? <p className="mt-1 text-sm text-danger">{errors.transactionId}</p> : null}
      </div>
      <div>
        <label htmlFor="sender" className="block font-medium text-ink">The number or account you paid from (optional)</label>
        <input id="sender" name="senderNumber" autoComplete="off" className={field} />
      </div>
      {canUpload ? (
        <div>
          <label htmlFor="receipt" className="block font-medium text-ink">Receipt{proof === 'upload' ? '' : ' (optional)'}</label>
          <input id="receipt" ref={file} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={`${field} py-2`} aria-invalid={Boolean(errors.proof)} />
          <p className="mt-1 text-xs text-muted">A photo, screenshot or PDF, up to 5 MB.</p>
          {errors.proof ? <p className="mt-1 text-sm text-danger">{errors.proof}</p> : null}
        </div>
      ) : null}
      <div>
        <label htmlFor="note" className="block font-medium text-ink">Note (optional)</label>
        <textarea id="note" name="note" rows={2} className={`${field} py-2`} />
      </div>
      {message ? <p role="alert" className="rounded-input border border-danger p-3 text-danger">{message}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Send payment details'}</button>
    </form>
  );
}
