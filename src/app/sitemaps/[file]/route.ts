import { sitemapEntries, urlsetXml } from '@/lib/seo/sitemap';
import { siteUrl } from '@/lib/seo/context';

export const revalidate = 3600;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const type = file.replace(/\.xml$/, '');
  const entries = file.endsWith('.xml') ? await sitemapEntries(type) : null;
  if (!entries) return new Response('Not found', { status: 404 });
  return new Response(urlsetXml(siteUrl(), entries), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
