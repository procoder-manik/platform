/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WishlistButton } from '@/components/site/client/Account';
import { getCustomer } from '@/lib/accounts/engine';
import { getDb } from '@/lib/db';
import { isOn } from '@/lib/modules/server';
import { ProductBuy } from '@/components/site/client/ProductBuy';
import { getShopProduct } from '@/lib/data/store';
import { seoMetadata } from '@/lib/seo/meta';
import { siteUrl } from '@/lib/seo/context';
import { getSetting } from '@/lib/settings/store';
import { storeSettings } from '@/lib/store/settings';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getShopProduct((await params).slug);
  if (!p) return {};
  return seoMetadata({ title: p.name, description: p.summary, path: `/shop/${p.slug}`, image: p.images[0] ?? null, seo: p.seo });
}

export default async function ProductPage({ params }: Props) {
  const [p, settings] = await Promise.all([getShopProduct((await params).slug), getSetting(storeSettings)]);
  if (!p) notFound();
  const base = siteUrl();
  const accounts = await isOn('accounts');
  const customer = accounts ? await getCustomer() : null;
  const saved = customer ? Boolean(await getDb().wishlistItem.findUnique({ where: { userId_productId: { userId: customer.id, productId: p.id } }, select: { id: true } })) : false;
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `${base}${u}`);
  const available = (v: { stock: number }) => !p.trackStock || v.stock > 0;
  const prices = p.variants.map((v) => v.price);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.summary ? { description: p.summary } : {}),
    ...(p.images.length ? { image: p.images.map(abs) } : {}),
    ...(p.variants[0]?.sku ? { sku: p.variants[0].sku } : {}),
    offers: prices.length > 1 && Math.max(...prices) > Math.min(...prices)
      ? { '@type': 'AggregateOffer', priceCurrency: p.currency, lowPrice: (Math.min(...prices) / 100).toFixed(2), highPrice: (Math.max(...prices) / 100).toFixed(2), offerCount: p.variants.length, availability: p.state === 'out' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' }
      : { '@type': 'Offer', priceCurrency: p.currency, price: ((prices[0] ?? p.price) / 100).toFixed(2), url: `${base}/shop/${p.slug}`, availability: p.variants.some(available) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
  };

  return (
    <article className="mx-auto max-w-shell px-5 pb-24 pt-12 sm:px-6 md:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/shop" className="hover:underline">{settings.title}</Link>
        {p.category ? <> / <Link href={`/shop?category=${p.category.slug}`} className="hover:underline">{p.category.name}</Link></> : null}
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-card border border-line bg-raised">{p.images[0] ? <img id="product-main" src={p.images[0]} alt={p.name} className="h-full w-full object-cover" /> : null}</div>
          {p.images.length > 1 ? <ul className="mt-3 grid grid-cols-5 gap-2">{p.images.slice(1, 6).map((src) => <li key={src} className="aspect-square overflow-hidden rounded-input border border-line"><img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /></li>)}</ul> : null}
        </div>
        <div>
          <h1>{p.name}</h1>
          {p.summary ? <p className="mt-3 text-lg">{p.summary}</p> : null}
          <div className="mt-6">
            <ProductBuy
              name={p.name}
              currency={p.currency}
              comparePrice={p.comparePrice}
              kind={p.kind}
              trackStock={p.trackStock}
              lowStockAt={p.lowStockAt}
              showCount={settings.showStockCount}
              options={p.options}
              variants={p.variants.map((v) => ({ id: v.id, key: v.key, label: v.label, price: v.price, stock: v.stock }))}
            />
          </div>
          {accounts ? <div className="mt-4"><WishlistButton productId={p.id} saved={saved} signedIn={Boolean(customer)} next={`/shop/${p.slug}`} /></div> : null}
        </div>
      </div>
      {p.bodyHtml ? <div className="prose-site mt-14 max-w-3xl text-lg" dangerouslySetInnerHTML={{ __html: p.bodyHtml }} /> : null}
    </article>
  );
}
