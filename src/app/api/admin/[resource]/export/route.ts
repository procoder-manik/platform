import type { NextRequest } from 'next/server';
import { handle } from '@/lib/http/route';
import { guardResource } from '@/lib/admin/guard';
import { exportCsv } from '@/lib/admin/repo';
import { writeAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** CSV export of selected rows (?ids=a,b) or of the whole list (?view=trash for Trash). */
export const GET = handle(async (request: NextRequest, { params }: { params: Promise<{ resource: string }> }) => {
  const { def, staff } = await guardResource((await params).resource);
  const ids = request.nextUrl.searchParams.get('ids');
  const view = request.nextUrl.searchParams.get('view') === 'trash' ? 'trash' : 'all';
  const csv = await exportCsv(def, ids ? ids.split(',').slice(0, 10_000) : null, view);
  await writeAudit({ userId: staff.id, action: `${def.entity}.export`, entity: def.entity, diff: { ids: ids ? ids.split(',').length : 'all' } });
  const name = `${def.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`\uFEFF${csv}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
});
