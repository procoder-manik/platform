'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';

/** Reveals elements with data-animate once they scroll into view. Does nothing for reduced motion. */
export function RevealObserver() {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('[data-animate]:not([data-shown])');
    if (!items.length) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.setAttribute('data-shown', ''));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-shown', '');
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

export function Countdown({ until, doneText }: { until: string; doneText: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const end = new Date(until).getTime();
  if (now === null) return <p className="h-16" aria-hidden="true" />;
  const left = Math.max(0, end - now);
  if (left === 0) return <p className="text-lg">{doneText}</p>;
  const parts = [
    { label: 'days', value: Math.floor(left / 86_400_000) },
    { label: 'hours', value: Math.floor(left / 3_600_000) % 24 },
    { label: 'minutes', value: Math.floor(left / 60_000) % 60 },
    { label: 'seconds', value: Math.floor(left / 1000) % 60 },
  ];
  return (
    <div role="timer" aria-live="off" className="flex flex-wrap gap-3">
      {parts.map((p) => (
        <div key={p.label} className="min-w-20 rounded-card border border-line bg-surface px-4 py-3 text-center">
          <span className="block font-display text-h3 font-semibold text-ink tabular-nums">{String(p.value).padStart(2, '0')}</span>
          <span className="text-sm text-muted">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Tabs({ items }: { items: { label: string; html: string }[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {items.map((item, i) => (
          <button
            key={i}
            id={`${base}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={active === i}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setActive((active + 1) % items.length);
              if (e.key === 'ArrowLeft') setActive((active - 1 + items.length) % items.length);
            }}
            className={`-mb-px min-h-11 border-b-2 px-4 font-medium ${active === i ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div key={i} id={`${base}-panel-${i}`} role="tabpanel" aria-labelledby={`${base}-tab-${i}`} hidden={active !== i} className="prose-site pt-6" dangerouslySetInnerHTML={{ __html: item.html }} />
      ))}
    </div>
  );
}

export function ContactForm({ showPhone, success, source }: { showPhone: boolean; success: string; source: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');
  useEffect(() => {
    // A quote button sends the package and service in the address; they start the message for the buyer.
    const q = new URLSearchParams(location.search);
    const pkg = q.get('package')?.slice(0, 80);
    const svc = q.get('service')?.slice(0, 80);
    if (pkg) {
      const t = setTimeout(() => setDraft(`I would like a quote for ${svc ? `${svc}: ` : ''}${pkg}.\n\n`), 0);
      return () => clearTimeout(t);
    }
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('sending');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, source }) });
      const body = (await response.json()) as { ok: boolean; message?: string; errors?: Record<string, string> };
      if (!body.ok) {
        setErrors(body.errors ?? {});
        setMessage(body.message ?? 'Your message was not sent. Try again.');
        setState('error');
        return;
      }
      setState('sent');
    } catch {
      setMessage('Your message was not sent. Check your connection and try again.');
      setState('error');
    }
  }
  if (state === 'sent') return <p role="status" className="rounded-card border border-success bg-surface p-5 text-ink">{success}</p>;
  const field = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink';
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="font-medium text-ink">Name</span>
        <input name="name" required autoComplete="name" className={field} aria-invalid={Boolean(errors.name)} />
        {errors.name ? <span className="mt-1 block text-sm text-danger">{errors.name}</span> : null}
      </label>
      <label className="block">
        <span className="font-medium text-ink">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} aria-invalid={Boolean(errors.email)} />
        {errors.email ? <span className="mt-1 block text-sm text-danger">{errors.email}</span> : null}
      </label>
      {showPhone ? (
        <label className="block sm:col-span-2">
          <span className="font-medium text-ink">Phone (optional)</span>
          <input name="phone" type="tel" autoComplete="tel" className={field} />
        </label>
      ) : null}
      <label className="block sm:col-span-2">
        <span className="font-medium text-ink">Message</span>
        <textarea name="message" required rows={5} className={`${field} py-2`} aria-invalid={Boolean(errors.message)} value={draft} onChange={(e) => setDraft(e.target.value)} />
        {errors.message ? <span className="mt-1 block text-sm text-danger">{errors.message}</span> : null}
      </label>
      <label className="sr-only" aria-hidden="true">
        Leave this empty
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>
      {state === 'error' ? <p role="alert" className="text-danger sm:col-span-2">{message}</p> : null}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send message'}
        </button>
      </div>
    </form>
  );
}
