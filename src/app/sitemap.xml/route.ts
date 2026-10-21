import { indexXml, sitemapTypes } from '@/lib/seo/sitemap';
import { siteUrl } from '@/lib/seo/context';

export const revalidate = 3600;

/** Sitemap index: one sitemap per content type of a switched-on module. */
export async function GET() {
  return new Response(indexXml(siteUrl(), await sitemapTypes()), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
