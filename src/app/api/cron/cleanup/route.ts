import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { RESOURCES } from '@/lib/admin/registry';
import { purgeTrash } from '@/lib/admin/repo';
import { cronAuthorised } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

const TRASH_RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS ?? 30);

/** Daily job: empties Trash past the retention and removes expired sessions. Protected by CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!cronAuthorised(request)) return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 401 });
  const trash = await purgeTrash(RESOURCES, TRASH_RETENTION_DAYS);
  const sessions = await getDb().session.deleteMany({ where: { expires: { lt: new Date() } } });
  return NextResponse.json({ ok: true, trash, sessions: sessions.count });
}
