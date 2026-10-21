'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { adjustStockAction } from '@/lib/store/admin-actions';
import { Button, Notice, PageHeader, inputClass } from '@/components/admin/ui';
import { formatDate } from '@/components/admin/format';

interface Row {
  id: string; productId: string; product: string; label: string; sku: string; stock: number; lowAt: number; status: string;
  moves: { id: string; delta: number; balance: number; reason: string; note: string | null; at: string }[];
}

const REASON: Record<string, string> = { initial: 'Starting stock', sale: 'Sold', release: 'Returned to stock', adjust: 'Removed by staff', restock: 'Added by staff' };

/** Stock for every tracked variant, lowest first. Add or remove with a note; every change is kept in the history. */
export function InventoryTable({ rows, search, view, timeZone }: { rows: Row[]; search: string; view: 'all' | 'low'; timeZone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [delta, setDelta] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});

  const apply = (row: Row) =>
    start(async () => {
      const n = Math.trunc(Number(delta[row.id]));
      if (!Number.isFinite(n) || n === 0) return setMessage({ ok: false, text: 'Enter how many to add (like 10) or remove (like -3).' });
      const r = await adjustStockAction(row.id, n, note[row.id] ?? '');
      setMessage({ ok: r.ok, text: r.ok ? `${row.product}${row.label ? ` (${row.label})` : ''}: ${r.message}` : r.message });
      if (r.ok) {
        setDelta((d) => ({ ...d, [row.id]: '' }));
        setNote((d) => ({ ...d, [row.id]: '' }));
        router.refresh();
      }
    });

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Inventory" description="Stock for every product that tracks it, lowest first. Sales take stock off by themselves; use this screen when goods arrive, break or go missing." />
      <form method="get" role="search" className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium text-ink">Search<input name="q" defaultValue={search} className={`${inputClass} mt-1`} placeholder="Product or SKU" /></label>
        <label className="text-sm font-medium text-ink">Show
          <select name="view" defaultValue={view} className={`${inputClass} mt-1`}><option value="all">Everything</option><option value="low">Running low (5 or fewer)</option></select>
        </label>
        <Button type="submit">Apply</Button>
      </form>
      {message ? <Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice> : null}
      {rows.length === 0 ? <p className="text-sm text-muted">Nothing to show. Products that track stock appear here once they are saved.</p> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-line text-muted"><tr><th scope="col" className="p-3 font-medium">Product</th><th scope="col" className="p-3 font-medium">SKU</th><th scope="col" className="p-3 text-right font-medium">In stock</th><th scope="col" className="p-3 font-medium">Change</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const tone = r.stock <= 0 ? 'text-danger' : r.lowAt > 0 && r.stock <= r.lowAt ? 'text-warning' : 'text-ink';
                return (
                  <tr key={r.id} className="border-b border-line align-top last:border-0">
                    <td className="p-3"><Link className="text-primary underline" href={`/admin/products/${r.productId}`}>{r.product}</Link>{r.label ? <span className="block text-muted">{r.label}</span> : null}{r.status !== 'PUBLISHED' ? <span className="block text-xs text-muted">Draft</span> : null}
                      {r.moves.length ? <details className="mt-1"><summary className="cursor-pointer text-xs text-muted">History</summary><ul className="mt-1 space-y-0.5 text-xs">{r.moves.map((m) => <li key={m.id}>{m.delta > 0 ? '+' : ''}{m.delta} ({REASON[m.reason] ?? m.reason}){m.note ? `, ${m.note}` : ''} <span className="text-muted">balance {m.balance}, {formatDate(m.at, timeZone)}</span></li>)}</ul></details> : null}
                    </td>
                    <td className="p-3 text-muted">{r.sku || 'None'}</td>
                    <td className={`p-3 text-right text-base font-semibold ${tone}`}>{r.stock}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-muted">Add or remove<input inputMode="numeric" aria-label={`Change for ${r.product} ${r.label}`} className={`${inputClass} mt-1 w-28`} value={delta[r.id] ?? ''} onChange={(e) => setDelta((d) => ({ ...d, [r.id]: e.target.value }))} placeholder="+10 or -3" /></label>
                        <label className="text-xs text-muted">Note<input aria-label={`Note for ${r.product} ${r.label}`} className={`${inputClass} mt-1 w-44`} value={note[r.id] ?? ''} onChange={(e) => setNote((d) => ({ ...d, [r.id]: e.target.value }))} placeholder="Delivery, damaged…" /></label>
                        <Button variant="primary" disabled={pending} onClick={() => apply(r)}>Apply</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
