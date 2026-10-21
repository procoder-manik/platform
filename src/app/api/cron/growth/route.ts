import { NextResponse, type NextRequest } from 'next/server';
import { cronAuthorised } from '@/lib/cron-auth';
import { isOn } from '@/lib/modules/server';
import { runGrowthCycle } from '@/lib/growth/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily job: makes commission ready to pay after its hold, and cancels unpaid orders that are holding a discount
 * code. Protected by CRON_SECRET. Safe to run more than once a day.
 */
export async function GET(request: NextRequest) {
  if (!cronAuthorised(request)) return NextResponse.json({ ok: false, message: 'Not allowed.' }, { status: 401 });
  const live = (await Promise.all(['coupons', 'referrals', 'affiliates'].map((m) => isOn(m)))).some(Boolean);
  if (!live) return NextResponse.json({ ok: true, skipped: 'Coupons, Referrals and Affiliates are all switched off.' });
  return NextResponse.json({ ok: true, ...(await runGrowthCycle()) });
}
