/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSetting } from '@/lib/data';
import { listApps } from '@/lib/data/content';
import { appsSettings } from '@/modules/productsShowcase/settings';
import { PageIntro } from '@/components/site/content/Cards';

export const revalidate = 3600;
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSetting(appsSettings);
  return { title: s.title, description: s.intro || undefined };
}

export default async function AppsPage() {
  const [s, apps] = await Promise.all([getSetting(appsSettings), listApps()]);
  return (
    <>
      <PageIntro title={s.title} intro={s.intro} />
      <div className="mx-auto grid max-w-shell gap-6 px-5 pb-24 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {apps.length === 0 ? <p className="text-muted">No products yet.</p> : null}
        {apps.map((a) => (
          <article key={a.id} className="group relative flex gap-4 rounded-card border border-line bg-surface p-5">
            {a.logo ? <img src={a.logo} alt="" className="h-14 w-14 shrink-0 rounded-input object-contain" loading="lazy" /> : null}
            <div>
              <h2 className="text-h5"><Link href={`/apps/${a.slug}`} className="after:absolute after:inset-0 group-hover:underline">{a.name}</Link></h2>
              {a.tagline ? <p className="mt-1">{a.tagline}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
