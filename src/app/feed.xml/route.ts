import { getSetting } from '@/lib/data';
import { feedPosts } from '@/lib/data/content';
import { isOn } from '@/lib/modules/server';
import { blogSettings } from '@/modules/blog/settings';
import { siteSettings } from '@/modules/core/settings';

export const revalidate = 3600;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS 2.0 feed of the latest 50 posts. 404 when the blog module is off. */
export async function GET() {
  if (!(await isOn('blog'))) return new Response('Not found', { status: 404 });
  const [site, blog, posts] = await Promise.all([getSetting(siteSettings), getSetting(blogSettings), feedPosts(50)]);
  const base = (process.env.SITE_URL ?? '').replace(/\/$/, '');
  const items = posts
    .map((p) => {
      const link = `${base}/blog/${p.slug}`;
      return `<item><title>${esc(p.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid>${p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ''}${p.author?.name ? `<dc:creator>${esc(p.author.name)}</dc:creator>` : ''}${p.category ? `<category>${esc(p.category.name)}</category>` : ''}<description>${esc(p.excerpt ?? '')}</description>${p.bodyHtml ? `<content:encoded><![CDATA[${p.bodyHtml.replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>` : ''}</item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${esc(`${blog.title} | ${site.siteName}`)}</title><link>${base}/blog</link><atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" /><description>${esc(blog.intro || site.tagline)}</description><language>en</language>${posts[0]?.publishedAt ? `<lastBuildDate>${new Date(posts[0].publishedAt).toUTCString()}</lastBuildDate>` : ''}${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
