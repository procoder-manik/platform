import { getSetting } from '@/lib/settings/store';
import { seoSettings } from '@/lib/seo/settings';
import { siteUrl } from '@/lib/seo/context';

export const revalidate = 3600;

/** robots.txt from SEO settings. The staging switch blocks everything. */
export async function GET() {
  const seo = await getSetting(seoSettings);
  const base = siteUrl();
  const body = seo.staging
    ? 'User-agent: *\nDisallow: /\n'
    : ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /preview/', '', seo.robotsExtra.trim(), '', `Sitemap: ${base}/sitemap.xml`].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') + '\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}
