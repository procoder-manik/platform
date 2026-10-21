import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { CartLines } from '@/components/site/client/CartLines';
import { formatMinor } from '@/lib/checkout/money';
import { priceBasket } from '@/lib/store/engine';
import { parseCart } from '@/lib/store/logic';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your cart', robots: { index: false, follow: false } };

export default async function CartPage() {
  const lines = parseCart((await cookies()).get('cart')?.value);
  const basket = await priceBasket({ lines });
  const blocking = basket.problems.filter((p) => p !== 'Your cart is empty.');

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-6 md:py-20">
      <h1>Your cart</h1>
      {basket.lines.length === 0 ? (
        <p className="mt-6 text-lg">Your cart is empty. <Link href="/shop" className="text-primary underline">Continue shopping</Link></p>
      ) : (
        <>
          {blocking.length ? <ul role="alert" className="mt-6 space-y-1 rounded-input border border-warning p-3">{blocking.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          <CartLines lines={basket.lines.map((l) => ({ id: l.variantId, title: l.title, image: l.image, quantity: l.quantity, unit: formatMinor(l.unitPrice, basket.currency), amount: formatMinor(l.amount, basket.currency), max: l.stock }))} />
          <dl className="mt-8 space-y-1 border-t border-line pt-4 text-right">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-semibold text-ink">{formatMinor(basket.totals.subtotal, basket.currency)}</dd></div>
          </dl>
          <p className="mt-2 text-right text-sm text-muted">Shipping and tax are worked out at checkout.</p>
          <p className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <Link href="/shop" className="btn btn-ghost">Continue shopping</Link>
            <Link href="/cart/checkout" className="btn btn-primary" aria-disabled={blocking.length > 0}>Checkout</Link>
          </p>
        </>
      )}
    </div>
  );
}
