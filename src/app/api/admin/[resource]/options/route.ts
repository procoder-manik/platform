import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/lib/http/route';
import { guardResource } from '@/lib/admin/guard';
import { listRecords } from '@/lib/admin/repo';
import { parseListQuery } from '@/lib/admin/query';

export const dynamic = 'force-dynamic';

/** Search used by relation fields: returns id and title pairs. */
export const GET = handle(async (request: NextRequest, { params }: { params: Promise<{ resource: string }> }) => {
  const { def } = await guardResource((await params).resource);
  const query = parseListQuery(def, { q: request.nextUrl.searchParams.get('q') ?? '', size: '25' });
  const { rows } = await listRecords(def, query);
  return NextResponse.json({ ok: true, options: rows.map((r) => ({ value: String(r.id), label: String(r[def.titleField] ?? r.id), ...(typeof r.slug === 'string' ? { slug: r.slug } : {}) })) });
});
