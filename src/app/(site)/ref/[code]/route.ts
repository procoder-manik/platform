import { NextResponse, type NextRequest } from 'next/server';
import { requireModule } from '@/lib/modules/server';
import { trackClick } from '@/lib/growth/engine';
import { normalizeCode } from '@/lib/growth/logic';
import { baseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

/** A friend's link: remembers the code for 30 days so checkout fills it in, then goes to the home page. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const home = new URL('/', await baseUrl());
  try {
    await requireModule('referrals');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const code = normalizeCode((await params).code);
  const response = NextResponse.redirect(home, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  if (code && (await trackClick('referral', code))) response.cookies.set('ref', code, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return response;
}
