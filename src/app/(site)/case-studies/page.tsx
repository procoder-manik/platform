/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { listCaseStudies } from '@/lib/data/content';
import { PageIntro } from '@/components/site/content/Cards';

export const metadata = { title: 'Case studies' };
export const revalidate = 3600;

export default async function CaseStudiesPage() {
  const items = await listCaseStudies();
  return (
    <>
      <PageIntro title="Case studies" intro="How we helped clients, step by step." />
      <div className="mx-auto grid max-w-shell gap-8 px-5 pb-24 sm:px-6 md:grid-cols-2">
        {items.length === 0 ? <p className="text-muted">No case studies yet.</p> : null}
        {items.map((c) => (
          <article key={c.id} className="group relative overflow-hidden rounded-card border border-line bg-surface">
            {c.cover ? <img src={c.cover} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" /> : null}
            <div className="p-6">
              {c.client ? <p className="text-sm font-medium text-primary">{c.client}</p> : null}
              <h2 className="mt-1 text-h4"><Link href={`/case-studies/${c.slug}`} className="after:absolute after:inset-0 group-hover:underline">{c.title}</Link></h2>
              {c.summary ? <p className="mt-2">{c.summary}</p> : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
