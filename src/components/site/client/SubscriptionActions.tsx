'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { renewNowAction, resumeRenewingAction, stopRenewingAction, type SubscriptionResult } from '@/lib/subscriptions/actions';

type Kind = 'renew' | 'restart' | 'stop' | 'resume';

const LABEL: Record<Kind, string> = { renew: 'Renew now', restart: 'Start again', stop: 'Stop renewing', resume: 'Keep renewing' };

/** The buttons on the customer's plan page. Each one runs a server action and then refreshes the page. */
export function SubscriptionActions({ token, actions }: { token: string; actions: Kind[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SubscriptionResult | null>(null);

  const run = (kind: Kind) => {
    if (kind === 'stop' && !window.confirm('Stop renewing this plan? It stays active until the end date and will not renew after that.')) return;
    start(async () => {
      setResult(null);
      const r = kind === 'stop' ? await stopRenewingAction(token) : kind === 'resume' ? await resumeRenewingAction(token) : await renewNowAction(token);
      setResult(r);
      if (!r.ok) return;
      if (r.redirect) window.location.assign(r.redirect);
      else router.refresh();
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {actions.map((kind) => (
          <button key={kind} type="button" disabled={pending} onClick={() => run(kind)} className={kind === 'renew' || kind === 'restart' || kind === 'resume' ? 'btn btn-primary' : 'btn btn-ghost'}>
            {pending ? 'One moment…' : LABEL[kind]}
          </button>
        ))}
      </div>
      {result ? <p role={result.ok ? 'status' : 'alert'} className={`mt-4 rounded-input border p-3 ${result.ok ? 'border-success' : 'border-danger text-danger'}`}>{result.message}</p> : null}
    </div>
  );
}
