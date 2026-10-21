/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seoMetadata } from '@/lib/seo/meta';
import { SeoHead } from '@/components/site/SeoHead';
import { getModuleStates } from '@/lib/data';
import { getCaseStudy } from '@/lib/data/content';
import { renderRichText } from '@/lib/richtext/render';

export const revalidate = 3600;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCaseStudy((await params).slug);
  if (!c) return {};
  return seoMetadata({ title: c.title, description: c.summary, path: `/case-studies/${c.slug}`, image: c.cover, seo: c.seo as Record<string, unknown> });
}

export default async function CaseStudyPage({ params }: Props) {
  const c = await getCaseStudy((await params).slug);
  if (!c) notFound();
  const states = await getModuleStates();
  const metrics = Array.isArray(c.metrics) ? (c.metrics as { value?: string; label?: string }[]) : [];
  const parts = [['The problem', c.problem], ['The approach', c.approach], ['The results', c.results]] as const;
  return (
    <article>
      <SeoHead resourceId="case-studies" record={c as unknown as Record<string, unknown>} />
      <header className="mx-auto max-w-3xl px-5 pb-10 pt-16 sm:px-6 md:pt-24">
        <Link href="/case-studies" className="text-sm text-muted hover:underline">Case studies</Link>
        <h1 className="mt-2">{c.title}</h1>
        {c.summary ? <p className="mt-4 text-lg">{c.summary}</p> : null}
        {c.client ? <p className="mt-3 text-sm text-muted">Client: {c.client}</p> : null}
      </header>
      {c.cover ? <img src={c.cover} alt="" className="mx-auto mb-12 w-full max-w-5xl sm:rounded-card" fetchPriority="high" /> : null}
      <div className="mx-auto max-w-3xl space-y-14 px-5 pb-24 sm:px-6">
        {metrics.length ? (
          <dl className="grid grid-cols-2 gap-6 rounded-card border border-line bg-surface p-6 md:grid-cols-3">
            {metrics.map((m, i) => <div key={i} className="flex flex-col-reverse"><dt className="text-muted">{m.label}</dt><dd className="font-display text-h2 font-semibold text-ink">{m.value}</dd></div>)}
          </dl>
        ) : null}
        {parts.map(([title, doc]) =>
          doc ? (
            <section key={title} aria-labelledby={title.replace(/\s/g, '-')}>
              <h2 id={title.replace(/\s/g, '-')}>{title}</h2>
              <div className="prose-site mt-4 max-w-none text-lg" dangerouslySetInnerHTML={{ __html: renderRichText(doc).html }} />
            </section>
          ) : null,
        )}
        {states.portfolio && c.project && c.project.status === 'PUBLISHED' && !c.project.deletedAt ? <p><Link href={`/portfolio/${c.project.slug}`} className="btn btn-ghost">See the project: {c.project.title}</Link></p> : null}
      </div>
    </article>
  );
}
