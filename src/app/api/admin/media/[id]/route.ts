import { NextResponse, type NextRequest } from 'next/server';
import { requireArea } from '@/lib/auth/guards';
import { handle } from '@/lib/http/route';
import { deleteMedia, updateMedia, updateSchema } from '@/lib/media/service';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: NextRequest, { params }: Ctx) => {
  const staff = await requireArea('media');
  const { id } = await params;
  return NextResponse.json({ ok: true, media: await updateMedia(id, updateSchema.parse(await request.json()), staff) });
});

/** Deletes a file. When it is in use, nothing happens unless ?force=1 is sent; the usage list is returned. */
export const DELETE = handle(async (request: NextRequest, { params }: Ctx) => {
  const staff = await requireArea('media');
  const { id } = await params;
  const result = await deleteMedia(id, request.nextUrl.searchParams.get('force') === '1', staff);
  return NextResponse.json({ ok: true, ...result });
});
