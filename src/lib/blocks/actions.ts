'use server';

import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { getStaff, staffCan } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { refresh } from '@/lib/cache/refresh';
import { TAGS } from '@/lib/cache/tags';
import { validateBlocks } from './validate';
import { newBlockId } from './types';

type Result = { ok: true; message: string; id?: string } | { ok: false; message: string };

/** Stores the builder's unsaved blocks for the live preview frame. One draft per staff member. */
export async function savePreviewDraft(blocks: unknown): Promise<Result> {
  const staff = await getStaff();
  if (!staff || !(staffCan(staff, 'content') || staffCan(staff, 'design'))) return { ok: false, message: 'Please sign in again.' };
  const checked = validateBlocks(blocks, { isAdmin: staff.areas.includes('*') });
  if (!checked.ok) return { ok: false, message: Object.values(checked.errors)[0] ?? 'Some sections need attention.' };
  const key = `preview:${staff.id}`;
  const data = { blocks: checked.blocks, at: Date.now() } as unknown as Prisma.InputJsonValue;
  await getDb().setting.upsert({ where: { key }, create: { key, data }, update: { data } });
  return { ok: true, message: 'Preview updated.' };
}

/** Saves one block as a reusable global section and returns its id. */
export async function saveAsGlobalSection(name: string, block: unknown): Promise<Result> {
  const staff = await getStaff();
  if (!staff || !staffCan(staff, 'design')) return { ok: false, message: 'Your role cannot create global sections.' };
  const checked = validateBlocks([block], { isAdmin: staff.areas.includes('*') });
  if (!checked.ok) return { ok: false, message: Object.values(checked.errors)[0] ?? 'This section is not valid.' };
  const clean = name.trim().slice(0, 80) || 'Saved section';
  const blocks = checked.blocks.map((b) => ({ ...b, id: newBlockId() })) as unknown as Prisma.InputJsonValue;
  const row = await getDb().globalSection.create({ data: { name: clean, blocks } });
  await writeAudit({ userId: staff.id, action: 'globalSection.create', entity: 'globalSection', entityId: row.id });
  refresh([TAGS.content, TAGS.type('globalSection')]);
  return { ok: true, message: `Saved as "${clean}". Edit it under Global sections.`, id: row.id };
}
