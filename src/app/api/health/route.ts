import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import pkg from '../../../../package.json';

export const dynamic = 'force-dynamic';

/** Health check: yes or no per dependency, never secret values. */
export async function GET() {
  let database = false;
  try {
    await getDb().$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  const body = {
    ok: database,
    version: pkg.version,
    checks: {
      database,
      authSecret: (process.env.AUTH_SECRET ?? '').length >= 32,
      siteUrl: Boolean(process.env.SITE_URL),
      storage: Boolean(process.env.STORAGE_PROVIDER),
      mail: Boolean(process.env.MAIL_PROVIDER),
    },
  };
  return NextResponse.json(body, { status: database ? 200 : 503 });
}
