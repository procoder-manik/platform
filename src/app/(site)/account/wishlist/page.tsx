/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccountShell } from '@/components/site/account/Shell';
import { WishlistButton } from '@/components/site/client/Account';
import { requireCustomerPage } from '@/lib/accounts/guard';
import { formatMinor } from '@/lib/checkout/money';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your wishlist', robots: { index: false, follow: false } };

export default async function WishlistPage() {
  if (!(await isOn('store'))) notFound();
  const customer = await requireCustomerPage('/account/wishlist');
  const items = await getDb().wishlistItem.findMany({ where: { userId: customer.id }, orderBy: { createdAt: 'desc' }, include: { product: true } });
  return (
    <AccountShell customer={customer} active="wishlist" title="Your wishlist">
      {items.length === 0 ? <p className="text-muted">Nothing saved yet. <Link href="/shop" className="text-primary underline">Browse the shop</Link></p> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map(({ id, product: p }) => (
            <li key={id} className="flex gap-4 rounded-card border border-line bg-surface p-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-input border border-line bg-raised">{p.images[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" /> : null}</div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{p.status === 'PUBLISHED' ? <Link href={`/shop/${p.slug}`} className="hover:underline">{p.name}</Link> : p.name}</p>
                <p className="text-sm text-muted">{p.status === 'PUBLISHED' ? formatMinor(p.price, p.currency) : 'No longer available'}</p>
                <div className="mt-2"><WishlistButton productId={p.id} saved signedIn next="/account/wishlist" /></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
