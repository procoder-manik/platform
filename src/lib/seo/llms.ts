import 'server-only';
import { getDb } from '@/lib/db';
import { getModuleStates } from '@/lib/modules/server';
import { getSetting } from '@/lib/settings/store';
import { siteSettings } from '@/modules/core/settings';
import { seoSettings } from './settings';
import { siteUrl } from './context';
import { sitemapEntries, sitemapTypes } from './sitemap';

const describe = (seo: unknown, fallback?: string | null) => String(((seo ?? {}) as Record<string, unknown>).description || fallback || '').replace(/\s+/g, ' ').trim();

/** llms.txt: a plain summary of the site for AI assistants. The full version adds post text. */
export async function buildLlms(full: boolean): Promise<string> {
  const [site, seo, states] = await Promise.all([getSetting(siteSettings), getSetting(seoSettings), getModuleStates()]);
  const base = siteUrl();
  const db = getDb();
  const out: string[] = [`# ${site.siteName}`, '', `> ${seo.llmsIntro || seo.description || site.tagline}`, ''];
  const pages = await db.page.findMany({ where: { status: 'PUBLISHED', deletedAt: null, NOT: { slug: 'not-found' } }, select: { title: true, slug: true, isHome: true, seo: true }, orderBy: { title: 'asc' } });
  out.push('## Pages', '', ...pages.filter((p) => (p.seo as Record<string, unknown> | null)?.noindex !== true).map((p) => `- [${p.title}](${base}${p.isHome ? '/' : `/${p.slug}`})${describe(p.seo) ? `: ${describe(p.seo)}` : ''}`), '');
  if (states.blog) {
    const posts = await db.post.findMany({ where: { status: 'PUBLISHED', deletedAt: null }, select: { title: true, slug: true, excerpt: true, seo: true, bodyHtml: true }, orderBy: { publishedAt: 'desc' }, take: full ? 200 : 50 });
    out.push('## Blog', '');
    for (const p of posts) {
      out.push(`- [${p.title}](${base}/blog/${p.slug})${describe(p.seo, p.excerpt) ? `: ${describe(p.seo, p.excerpt)}` : ''}`);
      if (full && p.bodyHtml) out.push('', p.bodyHtml.replace(/<\/(p|h[2-4]|li)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim(), '');
    }
    out.push('');
  }
  for (const type of (await sitemapTypes()).filter((t) => ['projects', 'case-studies', 'apps'].includes(t))) {
    const entries = (await sitemapEntries(type)) ?? [];
    if (entries.length > 1) out.push(`## ${type === 'projects' ? 'Portfolio' : type === 'apps' ? 'Products' : 'Case studies'}`, '', ...entries.slice(1).map((e) => `- ${base}${e.path}`), '');
  }
  if (site.contactEmail) out.push('## Contact', '', `- Email: ${site.contactEmail}`, '');
  return out.join('\n');
}
