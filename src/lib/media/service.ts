import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { refresh } from '@/lib/cache/refresh';
import { TAGS } from '@/lib/cache/tags';
import { HttpError } from '@/lib/http/errors';
import { getStorage, storageFor } from '@/lib/adapters/storage';
import { RESOURCES } from '@/lib/admin/registry';
import { slugify } from '@/lib/admin/slug';
import { ACCEPTED_MIME, SIZE_LIMITS, sniff, svgProblem } from '@/lib/security/file-type';
import type { StaffUser } from '@/lib/auth/guards';
import { Prisma, type Media } from '@/generated/prisma/client';

export const signSchema = z.object({
  fileName: z.string().min(1).max(200),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  folder: z.string().trim().max(60).optional(),
  replaceId: z.string().max(100).optional(),
});

function checkDeclared(mime: string, size: number) {
  const kind = ACCEPTED_MIME[mime];
  if (!kind) throw new HttpError(422, 'This file type is not accepted. Use an image, video, PDF, font, CSV or text file.');
  if (size > SIZE_LIMITS[kind]) {
    throw new HttpError(422, `This file is too large. The limit for this type is ${Math.round(SIZE_LIMITS[kind] / 1024 / 1024)} MB.`);
  }
}

/** Step 1: a signed, short-lived upload address. Replacing a file reuses its key so every link keeps working. */
export async function signUploadFor(input: z.infer<typeof signSchema>) {
  checkDeclared(input.mime, input.size);
  const storage = getStorage();
  if (!storage.configured) throw new HttpError(409, 'Uploads are not set up yet. Add a storage provider in the environment (see docs/SETUP.md).');
  let key: string;
  if (input.replaceId) {
    const existing = await getDb().media.findUnique({ where: { id: input.replaceId } });
    if (!existing) throw new HttpError(404, 'The file to replace no longer exists.');
    if (existing.provider !== storage.id) throw new HttpError(409, 'This file was stored with another provider and cannot be replaced in place. Upload a new file instead.');
    key = storage.id === 'cloudinary' ? existing.key.split('/').slice(1).join('/') : existing.key;
  } else {
    const dot = input.fileName.lastIndexOf('.');
    const ext = dot > 0 ? input.fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
    const base = slugify(dot > 0 ? input.fileName.slice(0, dot) : input.fileName, 'file').slice(0, 60);
    const folder = input.folder ? `${slugify(input.folder, 'files')}/` : '';
    const stamp = `${new Date().toISOString().slice(0, 7)}/${randomBytes(4).toString('hex')}`;
    key = `${folder}${stamp}-${base}${ext && storage.id !== 'cloudinary' ? `.${ext}` : ''}`;
  }
  return storage.signUpload({ key, mime: input.mime, size: input.size });
}

export const registerSchema = z.object({
  key: z.string().min(1).max(500),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  width: z.number().int().positive().max(50_000).optional(),
  height: z.number().int().positive().max(50_000).optional(),
  alt: z.string().max(300).optional(),
  folder: z.string().trim().max(60).optional(),
  replaceId: z.string().max(100).optional(),
});

/** Step 2: checks the stored bytes, then records the file. A file that fails the check is deleted at once. */
export async function registerUpload(input: z.infer<typeof registerSchema>, staff: StaffUser): Promise<Media> {
  checkDeclared(input.mime, input.size);
  const storage = getStorage();
  const head = await storage.read(input.key, 4096).catch(() => {
    throw new HttpError(422, 'The upload did not arrive. Try again.');
  });
  const found = sniff(head, input.mime);
  const reject = async (message: string) => {
    if (!input.replaceId) await storage.delete(input.key).catch(() => undefined);
    throw new HttpError(422, message);
  };
  if (!found) return reject('The file contents do not match an accepted type, so it was removed.');
  if (found.kind === 'svg') {
    const full = new TextDecoder().decode(await storage.read(input.key, SIZE_LIMITS.svg));
    const problem = svgProblem(full);
    if (problem) return reject(`${problem} It was removed for safety.`);
  }
  if (input.size > SIZE_LIMITS[found.kind]) return reject('This file is too large for its type, so it was removed.');

  const db = getDb();
  const data = {
    url: storage.url(input.key),
    provider: storage.id,
    key: input.key,
    mime: found.mime,
    size: input.size,
    width: input.width ?? null,
    height: input.height ?? null,
  };
  const media = input.replaceId
    ? await db.media.update({ where: { id: input.replaceId }, data })
    : await db.media.create({ data: { ...data, alt: input.alt ?? null, folder: input.folder || null } });
  await writeAudit({ userId: staff.id, action: input.replaceId ? 'media.replace' : 'media.upload', entity: 'media', entityId: media.id, diff: { key: input.key, mime: found.mime, size: input.size } });
  refresh([TAGS.content]);
  return media;
}

export const listSchema = z.object({
  q: z.string().max(100).optional(),
  folder: z.string().max(60).optional(),
  kind: z.enum(['image', 'video', 'document', 'all']).optional(),
  cursor: z.string().max(100).optional(),
  missingAlt: z.coerce.boolean().optional(),
});

export async function listMedia(input: z.infer<typeof listSchema>) {
  const where: Prisma.MediaWhereInput = {};
  if (input.q) where.OR = [{ alt: { contains: input.q, mode: 'insensitive' } }, { key: { contains: input.q, mode: 'insensitive' } }, { caption: { contains: input.q, mode: 'insensitive' } }];
  if (input.folder) where.folder = input.folder;
  if (input.kind === 'image') where.mime = { startsWith: 'image/' };
  if (input.kind === 'video') where.mime = { startsWith: 'video/' };
  if (input.kind === 'document') where.NOT = [{ mime: { startsWith: 'image/' } }, { mime: { startsWith: 'video/' } }];
  if (input.missingAlt) where.AND = [{ mime: { startsWith: 'image/' } }, { OR: [{ alt: null }, { alt: '' }] }];
  const take = 48;
  const items = await getDb().media.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const folders = await getDb().media.findMany({ where: { folder: { not: null } }, distinct: ['folder'], select: { folder: true }, orderBy: { folder: 'asc' } });
  return {
    items: items.slice(0, take),
    nextCursor: items.length > take ? items[take - 1]?.id : null,
    folders: folders.map((f) => f.folder).filter(Boolean) as string[],
    uploadsReady: getStorage().configured,
  };
}

export const updateSchema = z.object({
  alt: z.string().trim().max(300).nullable().optional(),
  caption: z.string().trim().max(500).nullable().optional(),
  folder: z.string().trim().max(60).nullable().optional(),
  focal: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable().optional(),
});

export async function updateMedia(id: string, input: z.infer<typeof updateSchema>, staff: StaffUser): Promise<Media> {
  const { focal, ...rest } = input;
  const data: Prisma.MediaUpdateInput = { ...rest };
  if (focal !== undefined) data.focal = focal === null ? Prisma.DbNull : focal;
  const media = await getDb().media.update({ where: { id }, data });
  await writeAudit({ userId: staff.id, action: 'media.update', entity: 'media', entityId: id, diff: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue });
  refresh([TAGS.content]);
  return media;
}

export interface UsageItem {
  resource: string;
  label: string;
  id: string;
  title: string;
  href: string;
}

const tableOf = (model: string) => model.charAt(0).toUpperCase() + model.slice(1);
const ident = (s: string) => `"${s.replace(/"/g, '')}"`;

/** Where a file is used: every resource column that holds media, and settings. Shown before delete. */
export async function mediaUsage(url: string): Promise<UsageItem[]> {
  const db = getDb();
  const like = `%${url.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const out: UsageItem[] = [];
  for (const def of RESOURCES) {
    const columns = new Set<string>(def.mediaColumns ?? []);
    for (const f of def.fields) if (['image', 'file', 'gallery', 'repeater', 'json', 'richtext'].includes(f.type)) columns.add(f.name.split('.')[0] as string);
    if (columns.size === 0) continue;
    const conditions = [...columns].map((c) => `${ident(c)}::text LIKE $1`).join(' OR ');
    const deleted = def.softDelete ? ' AND "deletedAt" IS NULL' : '';
    const rows = await db.$queryRawUnsafe<{ id: string; title: string | null }[]>(
      `SELECT "id"::text AS id, ${ident(def.titleField)}::text AS title FROM ${ident(tableOf(def.model))} WHERE (${conditions})${deleted} LIMIT 50`,
      like,
    );
    for (const r of rows) out.push({ resource: def.id, label: def.label, id: r.id, title: r.title ?? r.id, href: `/admin/${def.id}/${encodeURIComponent(r.id)}` });
  }
  const settings = await db.$queryRawUnsafe<{ key: string }[]>(`SELECT "key" FROM "Setting" WHERE "data"::text LIKE $1 AND "key" NOT LIKE 'views:%'`, like);
  for (const s of settings) out.push({ resource: 'settings', label: 'Settings', id: s.key, title: s.key, href: `/admin/settings/${s.key}` });
  return out;
}

export async function deleteMedia(id: string, force: boolean, staff: StaffUser): Promise<{ deleted: boolean; usage: UsageItem[] }> {
  const db = getDb();
  const media = await db.media.findUnique({ where: { id } });
  if (!media) throw new HttpError(404, 'This file no longer exists.');
  const usage = await mediaUsage(media.url);
  if (usage.length > 0 && !force) return { deleted: false, usage };
  await storageFor(media.provider).delete(media.key).catch((error: unknown) => {
    console.error('[media] storage delete failed; removing the record anyway', error);
  });
  await db.media.delete({ where: { id } });
  await writeAudit({ userId: staff.id, action: 'media.delete', entity: 'media', entityId: id, diff: { key: media.key, usedOn: usage.length } });
  refresh([TAGS.content]);
  return { deleted: true, usage };
}
