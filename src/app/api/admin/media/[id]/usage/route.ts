import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireArea } from '@/lib/auth/guards';
import { handle } from '@/lib/http/route';
import { HttpError } from '@/lib/http/errors';
import { mediaUsage } from '@/lib/media/service';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireArea('media');
  const { id } = await params;
  const media = await getDb().media.findUnique({ where: { id } });
  if (!media) throw new HttpError(404, 'This file no longer exists.');
  return NextResponse.json({ ok: true, usage: await mediaUsage(media.url) });
});
