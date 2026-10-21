'use client';

/* eslint-disable @next/next/no-img-element */
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { updateCartAction } from '@/lib/store/actions';

interface Line {
  id: string;
  title: string;
  image: string | null;
  quantity: number;
  unit: string;
  amount: string;
  max: number | null;
}

/** The items in the cart with quantity boxes and remove buttons. Every change goes through the server. */
export function CartLines({ lines }: { lines: Line[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');

  const change = (id: string, quantity: number) =>
    start(async () => {
      setMessage('');
      const r = await updateCartAction(id, quantity);
      if (!r.ok) setMessage(r.message);
      router.refresh();
    });

  return (
    <div>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-4 py-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-input border border-line bg-raised">{l.image ? <img src={l.image} alt="" className="h-full w-full object-cover" /> : null}</div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{l.title}</p>
              <p className="text-sm text-muted">{l.unit} each</p>
              <button type="button" disabled={pending} onClick={() => change(l.id, 0)} className="mt-1 text-sm text-primary underline">Remove</button>
            </div>
            <label className="text-sm">Quantity
              <input type="number" min={1} max={l.max ?? 99} defaultValue={l.quantity} disabled={pending} onBlur={(e) => { const n = Math.max(1, Math.floor(Number(e.target.value) || 1)); if (n !== l.quantity) change(l.id, n); }} className="mt-1 block min-h-11 w-20 rounded-input border border-line bg-surface px-3 text-ink" />
            </label>
            <p className="w-24 text-right font-semibold text-ink">{l.amount}</p>
          </li>
        ))}
      </ul>
      {message ? <p role="alert" className="mt-3 rounded-input border border-danger p-3 text-danger">{message}</p> : null}
    </div>
  );
}
