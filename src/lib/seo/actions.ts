'use server';

import { guardResource, failure } from '@/lib/admin/guard';
import { getRecord } from '@/lib/admin/repo';
import { setPath } from '@/lib/admin/fields';
import { getDb } from '@/lib/db';
import { requireArea } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { getResource } from '@/lib/admin/registry';
import type { Prisma } from '@/generated/prisma/client';
import { SEO_KINDS, seoReport, type SeoReport } from './context';

type Values = Record<string, unknown>;

/** Scores the unsaved editor values and rebuilds the schema, for the SEO and Schema panels. Nothing is saved. */
export async function seoDraftAction(resourceId: string, id: string | null, values: Values): Promise<{ ok: true; report: SeoReport } | { ok: false; message: string }> {
  try {
    const { def } = await guardResource(resourceId);
    if (!SEO_KINDS[def.id]) return { ok: false, message: 'This list has no SEO tab.' };
    const existing = id ? ((await getRecord(def, id)) ?? {}) : {};
    let draft: Values = { ...(def.defaults ?? {}), ...existing };
    for (const [k, v] of Object.entries(values)) draft = setPath(draft, k, v);
    return { ok: true, report: await seoReport(def, draft, id) };
  } catch (error) {
    const f = failure(error);
    return { ok: false, message: f.message };
  }
}

/** Recalculates and stores the score of every SEO-capable record. Used by the SEO overview. */
export async function rescoreAllAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const staff = await requireArea('seo');
    let count = 0;
    for (const resourceId of Object.keys(SEO_KINDS)) {
      const def = getResource(resourceId);
      if (!def) continue;
      const delegate = (getDb() as unknown as Record<string, { findMany(a: unknown): Promise<Values[]>; update(a: unknown): Promise<unknown> }>)[def.model];
      if (!delegate) continue;
      const rows = await delegate.findMany({ where: def.softDelete ? { deletedAt: null } : {}, take: 2000 });
      for (const row of rows) {
        const report = await seoReport(def, row, String(row.id));
        const seo = { ...((row.seo ?? {}) as Values), score: report.score, fixes: report.fixes.slice(0, 3) };
        await delegate.update({ where: { id: row.id }, data: { seo: seo as Prisma.InputJsonValue } });
        count += 1;
      }
    }
    await writeAudit({ userId: staff.id, action: 'seo.rescore', entity: 'seo', diff: { count } });
    return { ok: true, message: `${count} items scored again.` };
  } catch (error) {
    return failure(error);
  }
}
