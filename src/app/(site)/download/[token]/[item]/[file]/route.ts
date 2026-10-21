import { NextResponse, type NextRequest } from 'next/server';
import { requireModule } from '@/lib/modules/server';
import { claimDownload } from '@/lib/store/engine';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string; item: string; file: string }> };

/** Hands out one file of a paid digital order, after checking the order, the expiry and the download limit. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    await requireModule('store');
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
  const { token, item, file } = await params;
  const index = Number(file);
  if (token.length < 20 || token.length > 80 || !/^[A-Za-z0-9-]{8,64}$/.test(item) || !Number.isInteger(index) || index < 0 || index > 50) return new NextResponse('Not found', { status: 404 });
  const result = await claimDownload(token, item, index);
  if (!result.ok) return new NextResponse(result.message, { status: result.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  return NextResponse.redirect(new URL(result.url, new URL(_request.url).origin), { status: 302, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
