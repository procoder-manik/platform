import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/lib/http/route';
import { HttpError } from '@/lib/http/errors';
import { guardResource } from '@/lib/admin/guard';
import { importCsv } from '@/lib/admin/repo';

export const dynamic = 'force-dynamic';

/** CSV import: rows are matched on the resource's import key and created or updated through the normal save. */
export const POST = handle(async (request: NextRequest, { params }: { params: Promise<{ resource: string }> }) => {
  const { def, staff } = await guardResource((await params).resource);
  const text = await request.text();
  if (text.length > 5 * 1024 * 1024) throw new HttpError(413, 'The file is larger than 5 MB. Split it into smaller files.');
  return NextResponse.json({ ok: true, report: await importCsv(def, text, staff) });
});
