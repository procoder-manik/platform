'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { addToCartAction } from '@/lib/store/actions';
import { formatMinor } from '@/lib/checkout/money';
import { variantKey, stockState } from '@/lib/store/logic';

interface Props {
  name: string;
  currency: string;
  comparePrice: number | null;
  kind: string;
  trackStock: boolean;
  lowStockAt: number;
  showCount: boolean;
  options: { name: string; values: string[] }[];
  variants: { id: string; key: string; label: string; price: number; stock: number }[];
}

const field = 'mt-1 block min-h-11 w-full rounded-input border border-line bg-surface px-3 text-ink';

/** Option pickers, price, stock wording and the add to cart button of one product. */
export function ProductBuy({ currency, comparePrice, kind, trackStock, lowStockAt, showCount, options, variants }: Props) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const complete = options.every((o) => choice[o.name]);
  const variant = useMemo(() => (options.length === 0 ? variants[0] : complete ? variants.find((v) => v.key === variantKey(options, choice)) : undefined), [options, variants, choice, complete]);
  const prices = variants.map((v) => v.price);
  const state = variant ? stockState({ trackStock, stock: variant.stock, lowStockAt }) : 'in';
  const max = variant && trackStock ? Math.max(1, Math.min(99, variant.stock)) : 99;

  const price = variant ? formatMinor(variant.price, currency) : prices.length > 1 && Math.max(...prices) > Math.min(...prices) ? `${formatMinor(Math.min(...prices), currency)} to ${formatMinor(Math.max(...prices), currency)}` : formatMinor(prices[0] ?? 0, currency);
  const canBuy = Boolean(variant) && state !== 'out';

  return (
    <div>
      <p className="text-2xl font-semibold text-ink">
        {price}
        {comparePrice && variant && comparePrice > variant.price ? <s className="ml-3 text-base font-normal text-muted">{formatMinor(comparePrice, currency)}</s> : null}
      </p>
      {kind === 'digital' ? <p className="mt-1 text-sm text-muted">Digital download. You get the files on your order page after paying.</p> : null}

      {options.map((o) => (
        <div key={o.name} className="mt-5">
          <label htmlFor={`opt-${o.name}`} className="block font-medium text-ink">{o.name}</label>
          <select id={`opt-${o.name}`} className={field} value={choice[o.name] ?? ''} onChange={(e) => { setChoice((c) => ({ ...c, [o.name]: e.target.value })); setResult(null); setQty(1); }}>
            <option value="">Choose {o.name.toLowerCase()}…</option>
            {o.values.map((val) => {
              const probe = { ...choice, [o.name]: val };
              const match = options.every((x) => probe[x.name]) ? variants.find((v) => v.key === variantKey(options, probe)) : null;
              const gone = match && trackStock && match.stock <= 0;
              return <option key={val} value={val}>{val}{gone ? ' (sold out)' : ''}</option>;
            })}
          </select>
        </div>
      ))}

      {variant && state === 'out' ? <p role="status" className="mt-4 text-danger">Sold out.</p> : null}
      {variant && state === 'low' ? <p role="status" className="mt-4 text-warning">{showCount ? `Only ${variant.stock} left.` : 'Only a few left.'}</p> : null}
      {variant && state === 'in' && trackStock && showCount ? <p className="mt-4 text-sm text-muted">{variant.stock} in stock.</p> : null}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-ink">Quantity
          <input type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} className="mt-1 block min-h-11 w-24 rounded-input border border-line bg-surface px-3 text-ink" />
        </label>
        <button type="button" className="btn btn-primary" disabled={pending || !canBuy} onClick={() => start(async () => { setResult(null); if (!variant) return; setResult(await addToCartAction(variant.id, qty)); })}>
          {pending ? 'Adding…' : !variant && options.length ? 'Choose your options' : state === 'out' ? 'Sold out' : 'Add to cart'}
        </button>
      </div>
      {result ? <p role={result.ok ? 'status' : 'alert'} className={`mt-4 rounded-input border p-3 ${result.ok ? 'border-success' : 'border-danger text-danger'}`}>{result.message}{result.ok ? <> <Link href="/cart" className="text-primary underline">View cart</Link></> : null}</p> : null}
    </div>
  );
}
