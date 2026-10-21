import { NextResponse, type NextRequest } from 'next/server';
import { requireArea } from '@/lib/auth/guards';
import { handle } from '@/lib/http/route';
import { listMedia, listSchema, registerSchema, registerUpload } from '@/lib/media/service';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: NextRequest) => {
  await requireArea('media');
  const input = listSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ ok: true, ...(await listMedia(input)) });
});

/** Records an upload after checking its real bytes. */
export const POST = handle(async (request: NextRequest) => {
  const staff = await requireArea('media');
  const media = await registerUpload(registerSchema.parse(await request.json()), staff);
  return NextResponse.json({ ok: true, media });
});
