/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro } from '@/components/site/content/Cards';
import { formatMinor } from '@/lib/checkout/money';
import { listShopCategories, listShopProducts, type SortKey } from '@/lib/data/store';
import { getSetting } from '@/lib/settings/store';
import { storeSettings } from '@/lib/store/settings';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const [s, q] = await Promise.all([getSetting(storeSettings), searchParams]);
  const filtered = Boolean(q.category || q.q || q.sort || (q.page && q.page !== '1'));
  return { title: s.title, description: s.intro || undefined, alternates: { canonical: '/shop' }, robots: filtered ? { index: false, follow: true } : undefined };
}

const SORTS: { value: SortKey; label: string }[] = [{ value: 'featured', label: 'Featured' }, { value: 'new', label: 'Newest' }, { value: 'price_asc', label: 'Price, low to high' }, { value: 'price_desc', label: 'Price, high to low' }];

export default async function ShopPage({ searchParams }: Props) {
  const q = await searchParams;
  const sort = (SORTS.find((s) => s.value === q.sort)?.value ?? 'featured') as SortKey;
  const [settings, categories, result] = await Promise.all([getSetting(storeSettings), listShopCategories(), listShopProducts({ category: q.category, q: q.q?.slice(0, 80), sort, page: Number(q.page) || 1 })]);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category: q.category, q: q.q, sort: q.sort, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/shop?${s}` : '/shop';
  };
  const current = categories.find((c) => c.slug === q.category);

  return (
    <>
      <PageIntro title={current?.name ?? settings.title} intro={current?.description ?? settings.intro} />
      <div className="mx-auto max-w-shell px-5 pb-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <nav aria-label="Categories" className="flex flex-wrap gap-2">
            <Link href={href({ category: undefined, page: undefined })} aria-current={!q.category ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${!q.category ? 'border-primary text-ink' : 'border-line text-muted hover:text-ink'}`}>All</Link>
            {categories.map((c) => <Link key={c.id} href={href({ category: c.slug, page: undefined })} aria-current={q.category === c.slug ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${q.category === c.slug ? 'border-primary text-ink' : 'border-line text-muted hover:text-ink'}`}>{c.name}</Link>)}
          </nav>
          <form method="get" role="search" className="flex flex-wrap items-end gap-2">
            {q.category ? <input type="hidden" name="category" value={q.category} /> : null}
            <label className="text-sm">Search<input name="q" defaultValue={q.q ?? ''} className="mt-1 block min-h-11 rounded-input border border-line bg-surface px-3 text-ink" /></label>
            <label className="text-sm">Sort<select name="sort" defaultValue={sort} className="mt-1 block min-h-11 rounded-input border border-line bg-surface px-3 text-ink">{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
            <button className="btn btn-ghost" type="submit">Apply</button>
          </form>
        </div>

        {result.products.length === 0 ? <p className="mt-10 text-muted">No products found.{q.q || q.category ? <> <Link className="text-primary underline" href="/shop">See everything</Link></> : null}</p> : null}
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.products.map((p) => (
            <li key={p.id} className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface">
              <div className="aspect-square bg-raised">{p.images[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}</div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h2 className="text-h5"><Link href={`/shop/${p.slug}`} className="after:absolute after:inset-0 group-hover:underline">{p.name}</Link></h2>
                {p.summary ? <p className="line-clamp-2 text-sm">{p.summary}</p> : null}
                <p className="mt-auto pt-2 text-ink">
                  {p.hasRange ? <span className="text-sm text-muted">From </span> : null}
                  <span className="font-semibold">{formatMinor(p.from, p.currency)}</span>
                  {p.comparePrice && !p.hasRange ? <s className="ml-2 text-sm text-muted">{formatMinor(p.comparePrice, p.currency)}</s> : null}
                </p>
                {p.state === 'out' ? <p className="text-sm text-danger">Sold out</p> : p.kind === 'digital' ? <p className="text-sm text-muted">Digital download</p> : null}
              </div>
            </li>
          ))}
        </ul>

        {result.pages > 1 ? (
          <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-4">
            {result.page > 1 ? <Link className="btn btn-ghost" href={href({ page: String(result.page - 1) })}>Previous</Link> : null}
            <span className="text-sm text-muted">Page {result.page} of {result.pages}</span>
            {result.page < result.pages ? <Link className="btn btn-ghost" href={href({ page: String(result.page + 1) })}>Next</Link> : null}
          </nav>
        ) : null}
      </div>
    </>
  );
}
