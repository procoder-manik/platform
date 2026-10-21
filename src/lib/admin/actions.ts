'use server';

import { z } from 'zod';
import { getDb } from '@/lib/db';
import { requireArea } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { refresh } from '@/lib/cache/refresh';
import { TAGS } from '@/lib/cache/tags';
import { getSettingsGroup } from '@/lib/settings/registry';
import { saveSetting, getSetting } from '@/lib/settings/store';
import { requireModule } from '@/lib/modules/server';
import { HttpError } from '@/lib/http/errors';
import type { Prisma } from '@/generated/prisma/client';
import { failure, guardResource } from './guard';
import { bulkAction, duplicateRecord, restoreRevision, saveRecord, type BulkAction } from './repo';
import { validateValues } from './validate';
import { getPath, setPath } from './fields';

type Values = Record<string, unknown>;
export type ActionResult =
  | { ok: true; message: string; id?: string; record?: Values }
  | { ok: false; message: string; errors: Record<string, string> };

const idSchema = z.string().min(1).max(200);

export async function saveRecordAction(resourceId: string, id: string | null, values: Values): Promise<ActionResult> {
  try {
    const { def, staff } = await guardResource(resourceId);
    const result = await saveRecord(def, id === null ? null : idSchema.parse(id), z.record(z.string(), z.unknown()).parse(values), staff);
    if (!result.ok) return { ok: false, message: result.message, errors: result.errors };
    return { ok: true, message: result.message, id: String(result.record.id), record: result.record };
  } catch (error) {
    return failure(error);
  }
}

export async function quickEditAction(resourceId: string, id: string, values: Values): Promise<ActionResult> {
  try {
    const { def, staff } = await guardResource(resourceId);
    const only = def.quickEdit ?? [];
    if (only.length === 0) throw new HttpError(405, 'Quick edit is not available here.');
    const result = await saveRecord(def, idSchema.parse(id), values, staff, { only });
    if (!result.ok) return { ok: false, message: result.message, errors: result.errors };
    return { ok: true, message: 'Saved.', id, record: result.record };
  } catch (error) {
    return failure(error);
  }
}

const bulkSchema = z.object({
  action: z.enum(['publish', 'draft', 'duplicate', 'trash', 'restore', 'destroy']),
  ids: z.array(idSchema).max(500),
});

export async function bulkActionAction(resourceId: string, action: BulkAction, ids: string[]): Promise<ActionResult> {
  try {
    const { def, staff } = await guardResource(resourceId);
    const input = bulkSchema.parse({ action, ids });
    return { ok: true, message: await bulkAction(def, input.action, input.ids, staff) };
  } catch (error) {
    return failure(error);
  }
}

export async function duplicateAction(resourceId: string, id: string): Promise<ActionResult> {
  try {
    const { def, staff } = await guardResource(resourceId);
    const copy = await duplicateRecord(def, idSchema.parse(id), staff);
    return { ok: true, message: 'Duplicated as a draft.', id: String(copy.id) };
  } catch (error) {
    return failure(error);
  }
}

export async function restoreRevisionAction(resourceId: string, id: string, revisionId: string): Promise<ActionResult> {
  try {
    const { def, staff } = await guardResource(resourceId);
    const result = await restoreRevision(def, idSchema.parse(id), idSchema.parse(revisionId), staff);
    if (!result.ok) return { ok: false, message: result.message, errors: result.errors };
    return { ok: true, message: result.message, id, record: result.record };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSettingsAction(key: string, values: Values): Promise<ActionResult> {
  try {
    const group = getSettingsGroup(key);
    if (!group || group.customScreen) throw new HttpError(404, 'These settings do not exist.');
    const staff = await requireArea(group.area);
    await requireModule(group.module, 'admin');
    const isAdmin = staff.areas.includes('*');
    const checked = validateValues(group.fields, values, { isAdmin });
    if (!checked.ok) return { ok: false, message: 'Some fields need attention.', errors: checked.errors };
    const before = await getSetting(group);
    let next: Values = { ...(before as Values) };
    for (const [path, value] of Object.entries(checked.values)) {
      // A cleared text field becomes an empty string when the setting stores text, not null.
      const fallback = getPath(group.defaults, path);
      next = setPath(next, path, value === null && typeof fallback === 'string' ? '' : value);
    }
    const parsed = group.schema.safeParse(next);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, message: 'Some fields need attention.', errors: { [String(issue?.path.join('.') ?? '')]: issue?.message ?? 'Not valid.' } };
    }
    await saveSetting(group, parsed.data);
    await writeAudit({ userId: staff.id, action: 'settings.save', entity: 'setting', entityId: key, diff: JSON.parse(JSON.stringify({ before, after: parsed.data })) as Prisma.InputJsonValue });
    refresh([TAGS.settings, TAGS.setting(key), TAGS.content]);
    return { ok: true, message: 'Settings saved. The live site shows them on the next visit.' };
  } catch (error) {
    return failure(error);
  }
}

// ---------- saved list views (per staff member) ----------

import { viewKey, type SavedView } from './views';

export async function saveViewAction(resourceId: string, name: string, href: string): Promise<ActionResult> {
  try {
    const { staff } = await guardResource(resourceId);
    const clean = z.object({ name: z.string().trim().min(1).max(40), href: z.string().startsWith(`/admin/${resourceId}?`).max(1000) }).parse({ name, href });
    const db = getDb();
    const row = await db.setting.findUnique({ where: { key: viewKey(staff.id) } });
    const all = (row?.data ?? {}) as unknown as Record<string, SavedView[]>;
    const list = (all[resourceId] ?? []).filter((v) => v.name !== clean.name).concat(clean).slice(-20);
    const data = { ...all, [resourceId]: list } as unknown as Prisma.InputJsonValue;
    await db.setting.upsert({ where: { key: viewKey(staff.id) }, create: { key: viewKey(staff.id), data }, update: { data } });
    return { ok: true, message: `View "${clean.name}" saved.` };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteViewAction(resourceId: string, name: string): Promise<ActionResult> {
  try {
    const { staff } = await guardResource(resourceId);
    const db = getDb();
    const row = await db.setting.findUnique({ where: { key: viewKey(staff.id) } });
    const all = (row?.data ?? {}) as unknown as Record<string, SavedView[]>;
    const data = { ...all, [resourceId]: (all[resourceId] ?? []).filter((v) => v.name !== name) } as unknown as Prisma.InputJsonValue;
    await db.setting.upsert({ where: { key: viewKey(staff.id) }, create: { key: viewKey(staff.id), data }, update: { data } });
    return { ok: true, message: 'View removed.' };
  } catch (error) {
    return failure(error);
  }
}
