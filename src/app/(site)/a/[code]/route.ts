import { NextResponse, type NextRequest } from 'next/server';
import { requireModule } from '@/lib/modules/server';
import { getSetting } from '@/lib/settings/store';
import { trackClick } from '@/lib/growth/engine';
import { normalizeCode } from '@/lib/growth/logic';
import { affiliateSettings } from '@/lib/growth/settings';
import { baseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

/** Only addresses on this site: a path that starts with one slash. Anything else goes home. */
const safePath = (to: string | null): string => (to && /^\/(?!\/)[^\s\\]*$/.test(to) && to.length < 300 ? to : '/');

/** An affiliate's link: counts the click, remembers the affiliate for the set number of days, and goes on to the page. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    await requireModule('affiliates');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const code = normalizeCode((await params).code);
  const target = new URL(safePath(request.nextUrl.searchParams.get('to')), await baseUrl());
  const response = NextResponse.redirect(target, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  if (code && (await trackClick('affiliate', code))) {
    const settings = await getSetting(affiliateSettings);
    response.cookies.set('aff', code, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * settings.cookieDays });
  }
  return response;
}
