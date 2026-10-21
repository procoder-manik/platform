import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorised } from '@/lib/cron-auth';
import { isOn } from '@/lib/modules/server';
import { runCycle } from '@/lib/subscriptions/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily job: creates renewal invoices, sends reminders, starts the grace period and expires unpaid plans.
 * Protected by CRON_SECRET. Safe to run more than once a day: every step records what it already did.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorised(request)) return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 401 });
  // Plans keep their dates while the module is off; nothing is sent or changed until it is switched on again.
  if (!(await isOn('subscriptions'))) return NextResponse.json({ ok: true, skipped: 'The Subscriptions module is switched off.' });
  const summary = await runCycle();
  return NextResponse.json({ ok: true, ...summary });
}
