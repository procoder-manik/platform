import { NextResponse, type NextRequest } from 'next/server';
import { requireArea } from '@/lib/auth/guards';
import { handle } from '@/lib/http/route';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { HttpError } from '@/lib/http/errors';
import { signSchema, signUploadFor } from '@/lib/media/service';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: NextRequest) => {
  const staff = await requireArea('media');
  const limit = await rateLimit(`upload:${staff.id}`, { max: 120, windowMs: 60 * 60_000 });
  if (!limit.ok) throw new HttpError(429, 'Too many uploads in the last hour. Wait a little and try again.');
  return NextResponse.json({ ok: true, upload: await signUploadFor(signSchema.parse(await request.json())) });
});
