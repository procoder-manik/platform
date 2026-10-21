import { indexNowKey } from '@/lib/seo/indexnow';

export const dynamic = 'force-dynamic';

/** The IndexNow key file, so search engines can check pings come from this site. */
export async function GET() {
  return new Response(await indexNowKey(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
