import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { rateLimit } from '@/lib/adapters/ratelimit';
import { modulesForPath } from '@/lib/modules/logic';
import { getModuleStates, MODULE_METAS } from '@/lib/modules/server';

export const dynamic = 'force-dynamic';

const schema = z.object({ path: z.string().min(1).max(500).startsWith('/'), referrer: z.string().max(500).nullable().optional() });
const NOISE = /\.(php|env|asp|aspx|cgi|sql|bak|zip|ini)$|wp-(admin|login|content|includes)|^\/(admin|api|_next)\b/i;

/** Records a missing address for the 404 log. Ignores probes, admin paths and switched-off modules. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await rateLimit(`404:${ip}`, { max: 30, windowMs: 60_000 })).ok) return new NextResponse(null, { status: 204 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const path = parsed.data.path.split('?')[0] as string;
  if (NOISE.test(path)) return new NextResponse(null, { status: 204 });
  const states = await getModuleStates();
  if (modulesForPath(MODULE_METAS, path).some((m) => !states[m])) return new NextResponse(null, { status: 204 });
  const referrer = parsed.data.referrer && /^https?:\/\//.test(parsed.data.referrer) ? parsed.data.referrer : null;
  await getDb().notFoundHit.upsert({ where: { path }, create: { path, referrer }, update: { hits: { increment: 1 }, lastAt: new Date(), ...(referrer ? { referrer } : {}) } }).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
