import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getStaff } from '@/lib/auth/guards';
import { getModuleStates } from '@/lib/data';
import { renderBlocks } from '@/components/site/blocks/BlockRenderer';
import type { Block } from '@/lib/blocks/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preview', robots: { index: false, follow: false } };

/** The builder's live preview: the signed-in staff member's unsaved blocks. */
export default async function DraftPreview() {
  const staff = await getStaff();
  if (!staff) notFound();
  const row = await getDb().setting.findUnique({ where: { key: `preview:${staff.id}` } });
  const blocks = ((row?.data as { blocks?: Block[] } | null)?.blocks ?? []) as Block[];
  if (!blocks.length) return <p className="mx-auto max-w-shell px-6 py-24 text-center text-muted">Add a section to see it here.</p>;
  return <>{await renderBlocks(blocks, { modules: await getModuleStates() })}</>;
}
