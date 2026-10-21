import 'server-only';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings/store';
import { getModuleStates } from '@/lib/modules/server';
import { brandSettings } from '@/lib/theme/brand';
import { siteSettings } from '@/modules/core/settings';
import { navigationSettings } from '@/modules/core/navigation';
import type { ResourceDef } from '@/lib/admin/resource';
import { publicPathFor } from '@/lib/admin/preview';
import { renderRichText } from '@/lib/richtext/render';
import { extractContent } from './extract';
import { scoreSeo, type SeoInput, type SeoResult } from './score';
import { buildSchema, type PageContext, type SchemaNode, type SiteContext } from './schema';
import { seoSettings } from './settings';

/** Resources that have an SEO tab, and how each is described to the score and the schema graph. */
export const SEO_KINDS: Record<string, SeoInput['kind']> = { pages: 'page', posts: 'post', projects: 'project', 'case-studies': 'caseStudy', apps: 'app', categories: 'category' };
const TABLES: Record<string, string> = { pages: 'Page', posts: 'Post', projects: 'Project', 'case-studies': 'CaseStudy', apps: 'AppProduct', categories: 'Category' };
const TITLE_COLUMN: Record<string, string> = { apps: 'name', categories: 'name' };

export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export async function getSiteContext(): Promise<SiteContext> {
  const [site, brand, seo, nav, states] = await Promise.all([getSetting(siteSettings), getSetting(brandSettings), getSetting(seoSettings), getSetting(navigationSettings), getModuleStates()]);
  return {
    url: siteUrl(),
    name: site.siteName,
    description: seo.description || site.tagline,
    logo: seo.logo || brand.logoMark || brand.logoLight,
    social: nav.social.map((s) => s.url).filter((u) => /^https?:\/\//.test(u)),
    searchPath: states.blog ? '/blog?q=' : null,
    entity: seo.entity,
    businessType: seo.businessType,
    business: { ...seo, name: seo.businessName, hours: seo.hours as SiteContext['business']['hours'] },
  };
}

async function altFor(urls: string[]): Promise<Map<string, string | null>> {
  if (!urls.length) return new Map();
  const rows = await getDb().media.findMany({ where: { url: { in: urls } }, select: { url: true, alt: true } });
  return new Map(rows.map((r) => [r.url, r.alt]));
}

async function keywordUsedBy(resourceId: string, id: string | null, keyword: string): Promise<string[]> {
  if (!keyword.trim()) return [];
  const out: string[] = [];
  for (const [rid, table] of Object.entries(TABLES)) {
    const titleCol = TITLE_COLUMN[rid] ?? 'title';
    const deleted = ['pages', 'posts', 'projects', 'case-studies'].includes(rid) ? ' AND "deletedAt" IS NULL' : '';
    const rows = await getDb().$queryRawUnsafe<{ id: string; title: string }[]>(
      `SELECT "id", "${titleCol}" AS title FROM "${table}" WHERE LOWER("seo"->>'focusKeyword') = LOWER($1)${deleted} LIMIT 5`,
      keyword.trim(),
    );
    for (const r of rows) if (!(rid === resourceId && r.id === id)) out.push(r.title);
  }
  return out;
}

/** Page context for the schema graph, from a record of any SEO-capable resource. */
export async function pageContextFor(def: ResourceDef, record: Record<string, unknown>): Promise<PageContext> {
  const kind = SEO_KINDS[def.id] ?? 'page';
  const seo = (record.seo ?? {}) as Record<string, unknown>;
  const title = String(record[def.titleField] ?? '');
  const path = publicPathFor(def.publicPath, record) ?? '/';
  const content = extractContent(record);
  const crumbs: { name: string; path: string }[] = [{ name: 'Home', path: '/' }];
  let author: PageContext['author'] = null;
  let section: string | null = null;
  if (kind === 'post') {
    crumbs.push({ name: 'Blog', path: '/blog' });
    if (record.categoryId) {
      const cat = await getDb().category.findUnique({ where: { id: String(record.categoryId) }, select: { name: true, slug: true } });
      if (cat) {
        crumbs.push({ name: cat.name, path: `/blog/category/${cat.slug}` });
        section = cat.name;
      }
    }
    if (record.authorId) {
      const u = await getDb().user.findUnique({ where: { id: String(record.authorId) }, select: { id: true, name: true } });
      if (u?.name) author = { name: u.name, path: `/blog/author/${u.id}` };
    }
  } else if (kind === 'project') crumbs.push({ name: 'Portfolio', path: '/portfolio' });
  else if (kind === 'caseStudy') crumbs.push({ name: 'Case studies', path: '/case-studies' });
  else if (kind === 'app') crumbs.push({ name: 'Products', path: '/apps' });
  else if (kind === 'category') crumbs.push({ name: 'Blog', path: '/blog' });
  const isHome = record.isHome === true;
  if (!isHome) crumbs.push({ name: title, path });
  const description = String(seo.description || record.excerpt || record.summary || record.tagline || record.description || '') || null;
  const image = String(seo.ogImage || record.cover || record.bannerImage || record.scrollImage || record.logo || '') || null;
  return {
    kind: isHome ? 'home' : kind === 'category' ? 'category' : kind,
    path,
    title,
    description,
    image,
    datePublished: (record.publishedAt ?? record.createdAt ?? null) as string | null,
    dateModified: (record.updatedAt ?? null) as string | null,
    author,
    section,
    keywords: Array.isArray(record.tags) ? (record.tags as string[]) : Array.isArray(seo.keywords) ? (seo.keywords as string[]) : [],
    breadcrumbs: crumbs,
    faq: content.faq,
    appUrl: typeof record.url === 'string' ? record.url : null,
    seo,
  };
}

export interface SeoReport extends SeoResult {
  schema: SchemaNode[];
  suggestions: { title: string; href: string }[];
}

/** Scores a record and builds its schema. Used on save, by the editor panel and by the overview. */
export async function seoReport(def: ResourceDef, record: Record<string, unknown>, id: string | null): Promise<SeoReport> {
  const kind = SEO_KINDS[def.id] ?? 'page';
  const seo = (record.seo ?? {}) as Record<string, unknown>;
  const content = extractContent(record);
  const alts = await altFor(content.images.filter((i) => !i.alt).map((i) => i.src));
  content.images = content.images.map((i) => ({ ...i, alt: i.alt ?? alts.get(i.src) ?? null }));
  const [used, site, page] = await Promise.all([keywordUsedBy(def.id, id, String(seo.focusKeyword ?? '')), getSiteContext(), pageContextFor(def, record)]);
  const schema = seo.schemaType === 'none' ? [] : buildSchema(site, page);
  const result = scoreSeo({ kind, title: String(record[def.titleField] ?? ''), slug: String(record.slug ?? ''), seo, content, keywordUsedBy: used, siteHost: new URL(site.url).host, hasSchema: schema.length > 2 || seo.schemaType === 'none' });
  return { ...result, schema, suggestions: await linkSuggestions(seo, id) };
}

/** Internal-link ideas: live pages and posts whose title shares words with the focus keyword and related keywords. */
async function linkSuggestions(seo: Record<string, unknown>, id: string | null): Promise<{ title: string; href: string }[]> {
  const words = [String(seo.focusKeyword ?? ''), ...(Array.isArray(seo.keywords) ? (seo.keywords as string[]) : [])].join(' ').toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 6);
  if (!words.length) return [];
  const or = words.map((w) => ({ title: { contains: w, mode: 'insensitive' as const } }));
  const db = getDb();
  const [pages, posts] = await Promise.all([
    db.page.findMany({ where: { status: 'PUBLISHED', deletedAt: null, OR: or, ...(id ? { NOT: { id } } : {}) }, select: { title: true, slug: true, isHome: true }, take: 4 }),
    db.post.findMany({ where: { status: 'PUBLISHED', deletedAt: null, OR: or, ...(id ? { NOT: { id } } : {}) }, select: { title: true, slug: true }, take: 4 }),
  ]);
  return [...pages.map((p) => ({ title: p.title, href: p.isHome ? '/' : `/${p.slug}` })), ...posts.map((p) => ({ title: p.title, href: `/blog/${p.slug}` }))];
}

export { renderRichText };
