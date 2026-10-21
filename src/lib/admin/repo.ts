import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { refresh } from '@/lib/cache/refresh';
import { TAGS } from '@/lib/cache/tags';
import { HttpError } from '@/lib/http/errors';
import type { StaffUser } from '@/lib/auth/guards';
import { BUILT_IN_ROLES } from '@/lib/auth/areas';
import { getPath, setPath, type FieldDef } from './fields';
import { hooksFor, type HookContext } from './hooks';
import type { ListQuery } from './query';
import type { ResourceDef } from './resource';
import { slugify, uniqueSlug } from './slug';
import { validateValues } from './validate';
import { duplicateData } from './duplicate';
import { publicPathFor } from './preview';
import { csvToObjects, toCsv } from './csv';
import { validateBlocks } from '@/lib/blocks/validate';
import type { Block } from '@/lib/blocks/types';
import { SEO_KINDS, seoReport } from '@/lib/seo/context';
import { pingIndexNow } from '@/lib/seo/indexnow';

type Rec = Record<string, unknown>;
interface Delegate {
  findMany(args: unknown): Promise<Rec[]>;
  findFirst(args: unknown): Promise<Rec | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Rec>;
  update(args: unknown): Promise<Rec>;
  updateMany(args: unknown): Promise<{ count: number }>;
  delete(args: unknown): Promise<Rec>;
  deleteMany(args: unknown): Promise<{ count: number }>;
}

/** Columns that never leave the server. */
const SECRET_COLUMNS = ['passwordHash', 'twoFactorSecret'];
const REVISIONS_KEPT = 30;

function delegate(def: ResourceDef): Delegate {
  const d = (getDb() as unknown as Record<string, Delegate | undefined>)[def.model];
  if (!d) throw new Error(`Resource "${def.id}" points at unknown model "${def.model}".`);
  return d;
}

export function clean(record: Rec): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(record)) if (!SECRET_COLUMNS.includes(k)) out[k] = v;
  return out;
}

function tagsFor(def: ResourceDef, ...records: (Rec | null | undefined)[]): string[] {
  const tags: string[] = [TAGS.content, TAGS.type(def.entity)];
  for (const r of records) if (r && typeof r.slug === 'string') tags.push(TAGS.slug(r.slug));
  if (def.id === 'users' || def.id === 'roles') tags.push(TAGS.settings);
  return tags;
}

function baseWhere(def: ResourceDef, view: 'all' | 'trash' = 'all'): Rec {
  const where: Rec = { ...(def.baseWhere ?? {}) };
  if (def.softDelete) where.deletedAt = view === 'trash' ? { not: null } : null;
  return where;
}

/** Fills options that come from the database, such as the role list. */
export async function resolveFields(fields: readonly FieldDef[]): Promise<FieldDef[]> {
  const needsRoles = fields.some((f) => f.optionsFrom === 'roles');
  const needsStaff = fields.some((f) => f.optionsFrom === 'staff');
  const roles = needsRoles ? await getDb().role.findMany({ orderBy: { label: 'asc' } }) : [];
  const staff = needsStaff ? await getDb().user.findMany({ where: { kind: 'STAFF', blocked: false }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }) : [];
  return fields.map((f) =>
    f.optionsFrom === 'roles'
      ? { ...f, options: [...BUILT_IN_ROLES.map((r) => ({ value: r.id, label: r.label })), ...roles.map((r) => ({ value: r.id, label: r.label }))] }
      : f.optionsFrom === 'staff'
        ? { ...f, options: staff.map((u) => ({ value: u.id, label: u.name || u.email })) }
        : f,
  );
}

// ---------- reading ----------

export async function listRecords(def: ResourceDef, query: ListQuery) {
  const where: Rec = baseWhere(def, query.view);
  if (query.q) {
    where.OR = def.searchFields.map((field) => ({ [field]: { contains: query.q, mode: 'insensitive' } }));
  }
  for (const [field, value] of Object.entries(query.filters)) {
    const filter = def.filters?.find((f) => f.field === field);
    if (!filter) continue;
    const typed = filter.type === 'boolean' ? value === 'true' : value;
    where[field] = filter.mode === 'has' ? { has: typed } : typed;
  }
  const d = delegate(def);
  const [rows, total] = await Promise.all([
    d.findMany({ where, orderBy: { [query.sort.field]: query.sort.dir }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    d.count({ where }),
  ]);
  return { rows: rows.map(clean), total };
}

export async function trashCount(def: ResourceDef): Promise<number> {
  if (!def.softDelete) return 0;
  return delegate(def).count({ where: baseWhere(def, 'trash') });
}

export async function getRecord(def: ResourceDef, id: string, opts: { withSecrets?: boolean } = {}): Promise<Rec | null> {
  const where: Rec = { ...(def.baseWhere ?? {}), id };
  const row = await delegate(def).findFirst({ where });
  if (!row) return null;
  return opts.withSecrets ? row : clean(row);
}

// ---------- writing ----------

export type SaveResult = { ok: true; record: Rec; message: string } | { ok: false; errors: Record<string, string>; message: string };

/** Turns validated values keyed by dot path into column values, merging into JSON columns. */
function toColumns(values: Rec, existing: Rec | null): Rec {
  let out: Rec = {};
  for (const [path, value] of Object.entries(values)) {
    if (!path.includes('.')) {
      out[path] = value;
      continue;
    }
    const column = path.split('.')[0] as string;
    if (!(column in out)) {
      const current = existing?.[column];
      out[column] = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Rec) } : {};
    }
    out = setPath(out, path, value);
  }
  for (const [k, v] of Object.entries(out)) if (v === null && k !== 'publishAt' && isJsonColumn(k)) out[k] = Prisma.DbNull;
  return out;
}
const JSON_COLUMNS = new Set(['seo', 'blocks', 'focal', 'diff', 'data', 'body', 'problem', 'approach', 'results', 'metrics', 'video', 'afterBlocks', 'aiMeta', 'requirements', 'notes', 'updates', 'history', 'customer', 'proof', 'raw', 'snapshot']);
const isJsonColumn = (k: string) => JSON_COLUMNS.has(k);

async function assertUnique(def: ResourceDef, field: string, value: unknown, id: string | null) {
  if (typeof value !== 'string' || !value) return;
  const clash = await delegate(def).findFirst({ where: { [field]: value, ...(id ? { NOT: { id } } : {}) } });
  if (clash) throw new HttpError(422, 'This is already used by another item. Choose another.', field);
}

async function takenValues(def: ResourceDef, field: string, base: string): Promise<Set<string>> {
  const rows = await delegate(def).findMany({ where: { [field]: { startsWith: base } }, select: { [field]: true } });
  return new Set(rows.map((r) => String(r[field])));
}

/** Keeps redirects in step when a live address changes: old to new, no chains, no loops. */
async function redirectOnSlugChange(def: ResourceDef, before: Rec, after: Rec) {
  if (!def.publicPath || !def.statusField || before[def.statusField] !== 'PUBLISHED') return;
  const from = publicPathFor(def.publicPath, before);
  const to = publicPathFor(def.publicPath, after);
  if (!from || !to || from === to || from === '/') return;
  const db = getDb();
  await db.redirect.deleteMany({ where: { from: to } });
  await db.redirect.updateMany({ where: { to: from }, data: { to } });
  await db.redirect.upsert({ where: { from }, create: { from, to, code: 301, match: 'exact' }, update: { to, code: 301, active: true } });
}

async function storeRevision(def: ResourceDef, record: Rec, userId: string) {
  if (!def.revisions) return;
  const db = getDb();
  const id = String(record.id);
  await db.revision.create({ data: { entity: def.entity, entityId: id, data: JSON.parse(JSON.stringify(clean(record))) as Prisma.InputJsonValue, userId } });
  const old = await db.revision.findMany({ where: { entity: def.entity, entityId: id }, orderBy: { createdAt: 'desc' }, skip: REVISIONS_KEPT, select: { id: true } });
  if (old.length) await db.revision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
}

function diffOf(before: Rec | null, after: Rec): Rec {
  const diff: Rec = {};
  for (const [k, v] of Object.entries(clean(after))) {
    if (['updatedAt', 'createdAt'].includes(k)) continue;
    const prev = before?.[k];
    if (JSON.stringify(prev) !== JSON.stringify(v)) diff[k] = { from: prev ?? null, to: v ?? null };
  }
  if (before && after.passwordHash !== before.passwordHash) diff.password = 'changed';
  return JSON.parse(JSON.stringify(diff)) as Rec;
}

export async function saveRecord(
  def: ResourceDef,
  id: string | null,
  input: Rec,
  staff: StaffUser,
  opts: { only?: readonly string[]; fields?: readonly FieldDef[] } = {},
): Promise<SaveResult> {
  if (def.readOnly) throw new HttpError(405, `${def.labelPlural} cannot be edited.`);
  const isAdmin = staff.areas.includes('*');
  const existing = id ? await getRecord(def, id, { withSecrets: true }) : null;
  if (id && !existing) throw new HttpError(404, 'This item no longer exists. It may have been deleted.');
  if (!id && def.creatable === false) throw new HttpError(405, `New ${def.labelPlural.toLowerCase()} cannot be added here.`);

  const fields = opts.fields ?? (await resolveFields(def.fields));
  // Editors send values keyed by field path ("seo.title"); expand them into nested objects first.
  let expanded: Rec = {};
  for (const [key, value] of Object.entries(input)) expanded = key.includes('.') ? setPath(expanded, key, value) : { ...expanded, [key]: value };
  input = expanded;
  // Quick edit sends a few fields: merge over the stored record so conditions and required checks see everything.
  const base = existing && opts.only ? existing : (def.defaults ?? {});
  const merged: Rec = { ...base };
  for (const [key, value] of Object.entries(input)) {
    const current = merged[key];
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && current && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as Rec), ...(value as Rec) }
        : value;
  }
  // Empty slug fields are made from their source field, unique within the resource.
  for (const field of fields.filter((f) => f.type === 'slug')) {
    if (getPath(merged, field.name) || (opts.only && !opts.only.includes(field.name))) continue;
    const base = slugify(String(getPath(merged, field.from ?? def.titleField) ?? ''), def.entity);
    merged[field.name] = uniqueSlug(base, await takenValues(def, field.name, base));
  }
  const result = validateValues(fields, merged, { isAdmin, only: opts.only });
  if (!result.ok) return { ok: false, errors: result.errors, message: 'Some fields need attention.' };
  for (const field of fields.filter((f) => f.type === 'blocks' && f.name in result.values)) {
    const existingBlocks = Array.isArray(existing?.[field.name]) ? (existing[field.name] as Block[]) : [];
    const checked = validateBlocks(result.values[field.name], { isAdmin, existing: existingBlocks, prefix: field.name });
    if (!checked.ok) return { ok: false, errors: checked.errors, message: 'Some sections need attention.' };
    result.values[field.name] = checked.blocks;
  }

  const ctx: HookContext = { staff, isNew: !existing, existing: existing ? clean(existing) : null };
  const hooks = hooksFor(def.id);
  let values: Rec;
  try {
    for (const field of [def.slugField, ...(def.duplicate ? def.duplicate.unique ?? [] : [])]) {
      if (field && field in result.values) await assertUnique(def, field, result.values[field], id);
    }
    values = hooks.beforeSave ? await hooks.beforeSave({ ...result.values }, ctx) : result.values;
  } catch (error) {
    if (error instanceof HttpError && error.status === 422) {
      return { ok: false, errors: { [error.code]: error.message }, message: error.message };
    }
    throw error;
  }

  const data = toColumns(values, existing);
  if (!existing) Object.assign(data, def.baseWhere ?? {});
  // A cleared JSON column that the database requires falls back to the resource default.
  for (const [k, v] of Object.entries(data)) if (v === Prisma.DbNull && def.defaults?.[k] != null) data[k] = def.defaults[k];
  const record = existing
    ? await delegate(def).update({ where: { id }, data })
    : await delegate(def).create({ data });

  if (hooks.afterSave) await hooks.afterSave(record, ctx);
  if (existing) await redirectOnSlugChange(def, existing, record);
  await storeRevision(def, record, staff.id);
  await writeAudit({
    userId: staff.id,
    action: existing ? `${def.entity}.update` : `${def.entity}.create`,
    entity: def.entity,
    entityId: String(record.id),
    diff: diffOf(existing, record) as Prisma.InputJsonValue,
  });
  refresh(tagsFor(def, existing, record));
  let message = existing ? 'Saved.' : `${def.label} created.`;
  let finalRecord = record;
  if (SEO_KINDS[def.id]) {
    try {
      const report = await seoReport(def, record, String(record.id));
      const seo = { ...((record.seo ?? {}) as Rec), score: report.score, fixes: report.fixes.slice(0, 3) };
      finalRecord = await delegate(def).update({ where: { id: record.id }, data: { seo: seo as Prisma.InputJsonValue } });
      message += ` SEO score ${report.score}/100.${report.fixes[0] ? ` Next: ${report.fixes[0]}` : ''}`;
    } catch (error) {
      console.error('[seo] scoring failed', error);
    }
    if (def.statusField && finalRecord[def.statusField] === 'PUBLISHED') {
      const before = existing ? publicPathFor(def.publicPath, existing) : null;
      const after = publicPathFor(def.publicPath, finalRecord);
      if (after && (!existing || existing[def.statusField] !== 'PUBLISHED' || before !== after)) void pingIndexNow([after, ...(before && before !== after ? [before] : [])]);
    }
  }
  return { ok: true, record: clean(finalRecord), message };
}

export async function duplicateRecord(def: ResourceDef, id: string, staff: StaffUser): Promise<Rec> {
  if (!def.duplicate) throw new HttpError(405, `${def.labelPlural} cannot be duplicated.`);
  const record = await getRecord(def, id, { withSecrets: false });
  if (!record) throw new HttpError(404, 'This item no longer exists.');
  const taken: Record<string, Set<string>> = {};
  for (const field of def.duplicate.unique ?? []) {
    const value = record[field];
    if (typeof value === 'string') taken[field] = await takenValues(def, field, value);
  }
  const data = duplicateData(def, record, taken);
  if (def.softDelete) data.deletedAt = null;
  for (const [k, v] of Object.entries(data)) if (v === null && isJsonColumn(k)) data[k] = Prisma.DbNull;
  const copy = await delegate(def).create({ data });
  await storeRevision(def, copy, staff.id);
  await writeAudit({ userId: staff.id, action: `${def.entity}.duplicate`, entity: def.entity, entityId: String(copy.id), diff: { from: id } });
  refresh(tagsFor(def, copy));
  return clean(copy);
}

export type BulkAction = 'publish' | 'draft' | 'duplicate' | 'trash' | 'restore' | 'destroy';

export async function bulkAction(def: ResourceDef, action: BulkAction, ids: readonly string[], staff: StaffUser): Promise<string> {
  if (ids.length === 0) return 'Select at least one item.';
  if (ids.length > 500) throw new HttpError(422, 'Select 500 items or fewer at a time.');
  const d = delegate(def);
  const where = { ...(def.baseWhere ?? {}), id: { in: [...ids] } };
  const ctx = (existing: Rec): HookContext => ({ staff, isNew: false, existing });
  let count = 0;

  switch (action) {
    case 'publish':
    case 'draft': {
      if (!def.statusField) throw new HttpError(405, `${def.labelPlural} do not have a status.`);
      const data: Rec = { [def.statusField]: action === 'publish' ? 'PUBLISHED' : 'DRAFT' };
      if (def.fields.some((f) => f.name === 'publishAt')) data.publishAt = null;
      if (action === 'publish' && def.fields.some((f) => f.name === 'publishedAt' || f.name === 'body') && def.model === 'post') {
        await d.updateMany({ where: { ...where, publishedAt: null }, data: { publishedAt: new Date() } });
      }
      count = (await d.updateMany({ where, data })).count;
      break;
    }
    case 'duplicate':
      for (const id of ids) {
        await duplicateRecord(def, id, staff);
        count += 1;
      }
      return `${count} duplicated as drafts.`;
    case 'trash':
    case 'restore':
      if (!def.softDelete) throw new HttpError(405, `${def.labelPlural} do not use Trash.`);
      count = (await d.updateMany({ where: { id: { in: [...ids] } }, data: { deletedAt: action === 'trash' ? new Date() : null } })).count;
      break;
    case 'destroy': {
      if (def.deletable === false || (def.readOnly && def.deletable !== true)) throw new HttpError(405, `${def.labelPlural} cannot be deleted.`);
      const hooks = hooksFor(def.id);
      const rows = await d.findMany({ where: def.softDelete ? { id: { in: [...ids] } } : where });
      for (const row of rows) {
        if (def.softDelete && !row.deletedAt) throw new HttpError(422, 'Move items to Trash before deleting them for good.');
        if (hooks.beforeDelete) await hooks.beforeDelete(row, ctx(clean(row)));
      }
      count = (await d.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })).count;
      if (def.revisions) await getDb().revision.deleteMany({ where: { entity: def.entity, entityId: { in: rows.map((r) => String(r.id)) } } });
      break;
    }
  }

  await writeAudit({ userId: staff.id, action: `${def.entity}.${action}`, entity: def.entity, diff: { ids: [...ids], count } });
  refresh(tagsFor(def));
  const verbs: Record<BulkAction, string> = {
    publish: 'published', draft: 'switched to draft', duplicate: 'duplicated', trash: 'moved to Trash', restore: 'restored', destroy: 'deleted for good',
  };
  return `${count} ${count === 1 ? 'item' : 'items'} ${verbs[action]}.`;
}

// ---------- revisions ----------

export async function listRevisions(def: ResourceDef, id: string) {
  if (!def.revisions) return [];
  const rows = await getDb().revision.findMany({
    where: { entity: def.entity, entityId: id },
    orderBy: { createdAt: 'desc' },
    take: REVISIONS_KEPT,
    include: { user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, by: r.user?.name ?? r.user?.email ?? 'Unknown', data: r.data as Rec }));
}

export async function restoreRevision(def: ResourceDef, id: string, revisionId: string, staff: StaffUser): Promise<SaveResult> {
  const revision = await getDb().revision.findFirst({ where: { id: revisionId, entity: def.entity, entityId: id } });
  if (!revision) throw new HttpError(404, 'That version no longer exists.');
  const result = await saveRecord(def, id, revision.data as Rec, staff);
  if (result.ok) await writeAudit({ userId: staff.id, action: `${def.entity}.restore_revision`, entity: def.entity, entityId: id, diff: { revisionId } });
  return result.ok ? { ...result, message: 'Earlier version restored and saved.' } : result;
}

// ---------- CSV ----------

export async function exportCsv(def: ResourceDef, ids: readonly string[] | null, view: 'all' | 'trash' = 'all'): Promise<string> {
  const columns = def.csv?.columns ?? def.columns.map((c) => c.field);
  const where = ids ? { ...(def.baseWhere ?? {}), id: { in: [...ids] } } : baseWhere(def, view);
  const rows = await delegate(def).findMany({ where, orderBy: { [def.defaultSort.field]: def.defaultSort.dir }, take: 10_000 });
  return toCsv(columns, rows.map((r) => columns.map((c) => getPath(clean(r), c))));
}

export async function importCsv(def: ResourceDef, text: string, staff: StaffUser) {
  const key = def.csv?.importKey;
  if (!key) throw new HttpError(405, `${def.labelPlural} cannot be imported.`);
  const rows = csvToObjects(text);
  if (rows.length === 0) throw new HttpError(422, 'The file has no rows. The first row must hold the column names.');
  if (rows.length > 5000) throw new HttpError(422, 'Import 5,000 rows or fewer at a time.');
  const report = { created: 0, updated: 0, failed: [] as { row: number; message: string }[] };
  for (const [index, row] of rows.entries()) {
    const input: Rec = { ...row };
    for (const field of def.fields) {
      if (field.type === 'switch' && typeof input[field.name] === 'string') input[field.name] = ['true', '1', 'yes'].includes(String(input[field.name]).toLowerCase());
    }
    const existing = await delegate(def).findFirst({ where: { [key]: row[key] } });
    try {
      const result = await saveRecord(def, existing ? String(existing.id) : null, existing ? { ...clean(existing), ...input } : input, staff);
      if (result.ok) report[existing ? 'updated' : 'created'] += 1;
      else report.failed.push({ row: index + 2, message: Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join('; ') });
    } catch (error) {
      report.failed.push({ row: index + 2, message: error instanceof Error ? error.message : 'Could not save.' });
    }
  }
  return report;
}

// ---------- Trash retention ----------

/** Deletes items that have been in Trash longer than the retention. Called by the daily cleanup job. */
export async function purgeTrash(resources: readonly ResourceDef[], retentionDays: number): Promise<Record<string, number>> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const out: Record<string, number> = {};
  for (const def of resources.filter((r) => r.softDelete)) {
    const rows = await delegate(def).findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } });
    if (rows.length === 0) continue;
    const ids = rows.map((r) => String(r.id));
    await delegate(def).deleteMany({ where: { id: { in: ids } } });
    if (def.revisions) await getDb().revision.deleteMany({ where: { entity: def.entity, entityId: { in: ids } } });
    out[def.id] = ids.length;
  }
  return out;
}
