import { NextResponse } from 'next/server';
import { handle } from '@/lib/http/route';
import { requireModule } from '@/lib/modules/server';

export const dynamic = 'force-dynamic';

/** Example of a module-owned route handler: the first line checks the module. Returns 404 when Demo is off. */
export const GET = handle(async () => {
  await requireModule('demo', 'public');
  return NextResponse.json({ ok: true, module: 'demo' });
});
