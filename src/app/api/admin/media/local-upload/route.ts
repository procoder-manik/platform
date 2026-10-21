import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { requireArea } from '@/lib/auth/guards';
import { handle } from '@/lib/http/route';
import { HttpError } from '@/lib/http/errors';
import { localSignature, writeLocal } from '@/lib/adapters/storage/local';
import { SIZE_LIMITS } from '@/lib/security/file-type';

export const dynamic = 'force-dynamic';

/** Development-only upload target for the local storage provider. Signed, expiring, staff only. */
export const PUT = handle(async (request: NextRequest) => {
  if (process.env.NODE_ENV === 'production') throw new HttpError(404, 'Not found.');
  const key = request.nextUrl.searchParams.get('key') ?? '';
  // Payment receipts are uploaded by buyers, authorised by the signed, expiring address alone.
  if (!key.startsWith('proofs/')) await requireArea('media');
  const expires = Number(request.nextUrl.searchParams.get('expires'));
  const sig = Buffer.from(request.nextUrl.searchParams.get('sig') ?? '');
  const expected = Buffer.from(localSignature(key, expires));
  if (!key || !(expires > Date.now()) || sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    throw new HttpError(403, 'This upload link is not valid or has expired.');
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > SIZE_LIMITS.video) throw new HttpError(413, 'This file is too large.');
  await writeLocal(key, body);
  return NextResponse.json({ ok: true });
});
