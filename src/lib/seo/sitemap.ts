import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';
import { getModuleStates } from '@/lib/modules/server';
import { getSetting } from '@/lib/settings/store';
import { seoSettings } from './settings';

export interface SitemapEntry {
  path: string;
  lastmod?: Date | string | null;
  images?: string[];
  priority?: number | null;
  changefreq?: string | null;
}

const listed = (seo: unknown) => {
  const s = (seo ?? {}) as Record<string, unknown>;
  return s.noindex !== true && s.sitemap !== 'exclude';
};
const extras = (seo: unknown) => {
  const s = (seo ?? {}) as Record<string, unknown>;
  return { priority: typeof s.priority === 'number' ? s.priority : null, changefreq: typeof s.changefreq === 'string' ? s.changefreq : null };
};
const imgs = (...v: unknown[]) => v.filter((x): x is string => typeof x === 'string' && x.length > 0);
const livePost = () => ({ deletedAt: null, OR: [{ status: 'PUBLISHED' as const }, { status: 'SCHEDULED' as const, publishAt: { lte: new Date() } }] });

/** Each sitemap type and the module it belongs to. Types of switched-off modules are left out. */
const PROVIDERS: Record<string, { module: string; load: () => Promise<SitemapEntry[]> }> = {
  pages: {
    module: 'core',
    load: async () => {
      const rows = await getDb().page.findMany({ where: { status: 'PUBLISHED', deletedAt: null, NOT: { slug: 'not-found' } }, select: { slug: true, isHome: true, updatedAt: true, seo: true } });
      return rows.filter((r) => listed(r.seo)).map((r) => ({ path: r.isHome ? '/' : `/${r.slug}`, lastmod: r.updatedAt, ...extras(r.seo) }));
    },
  },
  posts: {
    module: 'blog',
    load: async () => {
      const rows = await getDb().post.findMany({ where: livePost(), select: { slug: true, updatedAt: true, cover: true, seo: true }, orderBy: { publishedAt: 'desc' } });
      return [{ path: '/blog' }, ...rows.filter((r) => listed(r.seo)).map((r) => ({ path: `/blog/${r.slug}`, lastmod: r.updatedAt, images: imgs(r.cover), ...extras(r.seo) }))];
    },
  },
  categories: {
    module: 'blog',
    load: async () => {
      const seo = await getSetting(seoSettings);
      if (!seo.indexCategories) return [];
      const rows = await getDb().category.findMany({ where: { posts: { some: livePost() } }, select: { slug: true, updatedAt: true, seo: true } });
      return rows.filter((r) => listed(r.seo)).map((r) => ({ path: `/blog/category/${r.slug}`, lastmod: r.updatedAt, ...extras(r.seo) }));
    },
  },
  projects: {
    module: 'portfolio',
    load: async () => {
      const rows = await getDb().project.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, select: { slug: true, updatedAt: true, bannerImage: true, scrollImage: true, gallery: true, seo: true } });
      return [{ path: '/portfolio' }, ...rows.filter((r) => listed(r.seo)).map((r) => ({ path: `/portfolio/${r.slug}`, lastmod: r.updatedAt, images: imgs(r.bannerImage, r.scrollImage, ...r.gallery), ...extras(r.seo) }))];
    },
  },
  'case-studies': {
    module: 'caseStudies',
    load: async () => {
      const rows = await getDb().caseStudy.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, select: { slug: true, updatedAt: true, cover: true, seo: true } });
      return [{ path: '/case-studies' }, ...rows.filter((r) => listed(r.seo)).map((r) => ({ path: `/case-studies/${r.slug}`, lastmod: r.updatedAt, images: imgs(r.cover), ...extras(r.seo) }))];
    },
  },
  apps: {
    module: 'productsShowcase',
    load: async () => {
      const rows = await getDb().appProduct.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, logo: true, seo: true } });
      return [{ path: '/apps' }, ...rows.filter((r) => listed(r.seo)).map((r) => ({ path: `/apps/${r.slug}`, lastmod: r.updatedAt, images: imgs(r.logo), ...extras(r.seo) }))];
    },
  },
  products: {
    module: 'store',
    load: async () => {
      const rows = await getDb().storeProduct.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, images: true, seo: true } });
      return [{ path: '/shop' }, ...rows.filter((r) => listed(r.seo)).map((r) => ({ path: `/shop/${r.slug}`, lastmod: r.updatedAt, images: imgs(...r.images.slice(0, 5)), ...extras(r.seo) }))];
    },
  },
  services: {
    module: 'services',
    load: async () => [{ path: '/pricing' }],
  },
  other: {
    module: 'resume',
    load: async () => [{ path: '/resume' }],
  },
};

export async function sitemapTypes(): Promise<string[]> {
  const states = await getModuleStates();
  return Object.entries(PROVIDERS).filter(([, p]) => states[p.module]).map(([k]) => k);
}

/** Built on request and cached until content changes. */
export async function sitemapEntries(type: string): Promise<SitemapEntry[] | null> {
  const provider = PROVIDERS[type];
  if (!provider || !(await sitemapTypes()).includes(type)) return null;
  return unstable_cache(provider.load, ['sitemap', type], { tags: [TAGS.content, TAGS.settings], revalidate: 3600 })();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const absolute = (base: string, p: string) => (/^https?:\/\//.test(p) ? p : `${base}${p}`);

export function urlsetXml(base: string, entries: SitemapEntry[]): string {
  const body = entries
    .map((e) => {
      const images = (e.images ?? []).map((i) => `<image:image><image:loc>${esc(absolute(base, i))}</image:loc></image:image>`).join('');
      return `<url><loc>${esc(absolute(base, e.path))}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ''}${e.changefreq ? `<changefreq>${esc(e.changefreq)}</changefreq>` : ''}${typeof e.priority === 'number' ? `<priority>${Math.min(1, Math.max(0, e.priority)).toFixed(1)}</priority>` : ''}${images}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`;
}

export function indexXml(base: string, types: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${types.map((t) => `<sitemap><loc>${esc(`${base}/sitemaps/${t}.xml`)}</loc></sitemap>`).join('')}</sitemapindex>`;
}
