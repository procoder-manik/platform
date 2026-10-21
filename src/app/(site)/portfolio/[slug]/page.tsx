/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seoMetadata } from '@/lib/seo/meta';
import { SeoHead } from '@/components/site/SeoHead';
import { getModuleStates, getSetting } from '@/lib/data';
import { getProject } from '@/lib/data/content';
import { portfolioSettings } from '@/modules/portfolio/settings';
import { ScrollShot } from '@/components/site/client/Article';
import { VideoPlayer } from '@/components/site/blocks/parts';

export const revalidate = 3600;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProject((await params).slug);
  if (!p) return {};
  return seoMetadata({ title: p.title, description: p.summary, path: `/portfolio/${p.slug}`, image: p.bannerImage ?? p.scrollImage, seo: p.seo as Record<string, unknown> });
}

export default async function ProjectPage({ params }: Props) {
  const p = await getProject((await params).slug);
  if (!p) notFound();
  const [s, states] = await Promise.all([getSetting(portfolioSettings), getModuleStates()]);
  const results = Array.isArray(p.results) ? (p.results as { value?: string; label?: string }[]) : [];
  const video = (p.video ?? {}) as { url?: string };
  const facts = [['Client', p.client], ['Industry', p.industry], ['Platform', p.platform], ['Services', p.services.join(', ')], ['Technologies', p.technologies.join(', ')]].filter(([, v]) => v);
  return (
    <article>
      <SeoHead resourceId="projects" record={p as unknown as Record<string, unknown>} />
      <header className="mx-auto max-w-shell px-5 pb-10 pt-16 sm:px-6 md:pt-24">
        <Link href="/portfolio" className="text-sm text-muted hover:underline">{s.title}</Link>
        <h1 className="mt-2">{p.title}</h1>
        {p.summary ? <p className="mt-4 max-w-2xl text-lg">{p.summary}</p> : null}
        {p.liveUrl ? <a href={p.liveUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-6">Visit the live site</a> : null}
      </header>
      <div className="mx-auto max-w-shell space-y-14 px-5 pb-24 sm:px-6">
        {p.bannerImage ? <img src={p.bannerImage} alt="" className="w-full rounded-card" fetchPriority="high" /> : null}
        <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            {p.bodyHtml ? <div className="prose-site max-w-none text-lg" dangerouslySetInnerHTML={{ __html: p.bodyHtml }} /> : null}
          </div>
          <aside className="space-y-4">
            <dl className="space-y-3 rounded-card border border-line bg-surface p-5 text-sm">
              {facts.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
            </dl>
            {states.caseStudies && p.caseStudies.length ? <p className="text-sm">Read the case study: {p.caseStudies.map((c) => <Link key={c.slug} href={`/case-studies/${c.slug}`} className="text-primary underline">{c.title}</Link>)}</p> : null}
          </aside>
        </div>
        {results.length ? (
          <dl className="grid grid-cols-2 gap-6 rounded-card border border-line bg-surface p-6 md:grid-cols-4">
            {results.map((r, i) => <div key={i} className="flex flex-col-reverse"><dt className="text-muted">{r.label}</dt><dd className="font-display text-h2 font-semibold text-ink">{r.value}</dd></div>)}
          </dl>
        ) : null}
        {p.scrollImage ? <div className="mx-auto max-w-4xl"><ScrollShot src={p.scrollImage} alt={`Full-page screenshot of ${p.title}`} speed={s.scrollSpeed} href={p.liveUrl} /><p className="mt-2 text-center text-sm text-muted">Hover or tap to scroll the page.</p></div> : null}
        {video.url ? <VideoPlayer url={video.url} title={`${p.title} walkthrough`} /> : null}
        {p.gallery.length ? <div className="grid gap-4 sm:grid-cols-2">{p.gallery.map((src) => <img key={src} src={src} alt="" loading="lazy" className="w-full rounded-card" />)}</div> : null}
      </div>
    </article>
  );
}
