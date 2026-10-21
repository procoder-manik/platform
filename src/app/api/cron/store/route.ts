import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorised } from '@/lib/cron-auth';
import { isOn } from '@/lib/modules/server';
import { expireUnpaidOrders } from '@/lib/store/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily job: cancels store orders that were not paid in time and puts their stock back on sale. Protected by CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!cronAuthorised(request)) return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 401 });
  if (!(await isOn('store'))) return NextResponse.json({ ok: true, skipped: 'The Store module is switched off.' });
  return NextResponse.json({ ok: true, ...(await expireUnpaidOrders()) });
}
