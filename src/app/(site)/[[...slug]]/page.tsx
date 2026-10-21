import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { getModuleStates, getSetting } from '@/lib/data';
import { findRedirect, getHomePage, getPageBySlug, type PublicPage } from '@/lib/data/pages';
import { siteSettings } from '@/modules/core/settings';
import { renderBlocks } from '@/components/site/blocks/BlockRenderer';
import { SLUG_PATTERN } from '@/lib/admin/slug';
import { seoMetadata } from '@/lib/seo/meta';
import { SeoHead } from '@/components/site/SeoHead';
import { extractContent } from '@/lib/seo/extract';

/** Builder pages are static and refreshed on save (cache tags), with an hourly fallback. */
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug?: string[] }> };

async function load(slug?: string[]): Promise<PublicPage | null> {
  if (!slug?.length) return getHomePage();
  if (slug.length !== 1 || !SLUG_PATTERN.test(slug[0] as string) || slug[0] === 'not-found') return null;
  return getPageBySlug(slug[0] as string);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) return {};
  const meta = seoMetadata({ title: page.title, path: page.isHome ? '/' : `/${page.slug}`, seo: page.seo });
  // The home page uses the site name as its title unless an SEO title is set.
  return page.isHome && !page.seo.title ? { ...meta, title: undefined } : meta;
}

export default async function BuilderPage({ params }: Props) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) {
    if (slug?.length) {
      const path = `/${slug.map(encodeURIComponent).join('/')}`;
      const found = await findRedirect(path);
      if (found && found.code === 410) notFound();
      if (found) (found.code === 302 ? redirect : permanentRedirect)(found.to);
      notFound();
    }
    // No home page yet: a friendly placeholder instead of a 404.
    const site = await getSetting(siteSettings);
    return (
      <section className="mx-auto max-w-shell px-5 py-24 sm:px-6">
        <h1>{site.siteName}</h1>
        <p className="mt-4 max-w-2xl text-lg">{site.tagline}</p>
        <p className="mt-8 text-sm text-muted">
          This site is being set up. Mark a page as the home page in <Link className="text-primary underline" href="/admin/pages">Admin, Pages</Link>.
        </p>
      </section>
    );
  }
  const states = await getModuleStates();
  const startsWithHero = page.blocks.find((b) => !b.hidden)?.type === 'hero';
  return (
    <>
      <SeoHead resourceId="pages" record={{ ...page, blocks: page.blocks, faq: extractContent({ blocks: page.blocks }).faq }} />
      {startsWithHero ? null : <h1 className="sr-only">{page.title}</h1>}
      {await renderBlocks(page.blocks, { modules: states })}
    </>
  );
}
