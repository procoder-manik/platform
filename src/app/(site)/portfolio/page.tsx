import type { Metadata } from 'next';
import Link from 'next/link';
import { getSetting } from '@/lib/data';
import { listProjects, projectFacets } from '@/lib/data/content';
import { portfolioSettings } from '@/modules/portfolio/settings';
import { PageIntro, ProjectCard } from '@/components/site/content/Cards';
import { SeoHead, collectionContext } from '@/components/site/SeoHead';

type Props = { searchParams: Promise<{ platform?: string; service?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const s = await getSetting(portfolioSettings);
  const f = await searchParams;
  return { title: s.title, description: s.intro || undefined, alternates: { canonical: '/portfolio' }, robots: f.platform || f.service ? { index: false, follow: true } : undefined };
}

export default async function PortfolioPage({ searchParams }: Props) {
  const { platform, service } = await searchParams;
  const [s, facets] = await Promise.all([getSetting(portfolioSettings), projectFacets()]);
  const projects = await listProjects({ platform: facets.platforms.includes(platform ?? '') ? platform : undefined, service: facets.services.includes(service ?? '') ? service : undefined });
  const chip = (label: string, href: string, on: boolean) => (
    <Link key={href} href={href} aria-current={on ? 'true' : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${on ? 'border-primary bg-primary text-primary-ink' : 'border-line text-ink hover:bg-raised'}`}>{label}</Link>
  );
  const q = (p?: string, sv?: string) => {
    const params = new URLSearchParams();
    if (p) params.set('platform', p);
    if (sv) params.set('service', sv);
    const qs = params.toString();
    return qs ? `/portfolio?${qs}` : '/portfolio';
  };
  return (
    <>
      <SeoHead page={collectionContext('/portfolio', s.title, s.intro || null, [{ name: s.title, path: '/portfolio' }])} />
      <PageIntro title={s.title} intro={s.intro} />
      <div className="mx-auto max-w-shell px-5 pb-24 sm:px-6">
        {s.showFilters && (facets.platforms.length > 1 || facets.services.length > 1) ? (
          <nav aria-label="Filter projects" className="mb-10 space-y-3">
            {facets.platforms.length > 1 ? <div className="flex flex-wrap gap-2">{chip('All platforms', q(undefined, service), !platform)}{facets.platforms.map((p) => chip(p, q(p, service), platform === p))}</div> : null}
            {facets.services.length > 1 ? <div className="flex flex-wrap gap-2">{chip('All services', q(platform, undefined), !service)}{facets.services.map((sv) => chip(sv, q(platform, sv), service === sv))}</div> : null}
          </nav>
        ) : null}
        {projects.length === 0 ? <p className="rounded-card border border-line bg-surface p-8 text-center">No projects match these filters.</p> : (
          <div className="grid gap-10 md:grid-cols-2">
            {projects.map((p) => <ProjectCard key={p.id} project={p} speed={s.scrollSpeed} />)}
          </div>
        )}
      </div>
    </>
  );
}
