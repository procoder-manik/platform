import 'server-only';
import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';
import type { Block } from '@/lib/blocks/types';

export interface PublicPage {
  id: string;
  title: string;
  slug: string;
  blocks: Block[];
  seo: Record<string, unknown>;
  isHome: boolean;
  updatedAt: Date;
}

const select = { id: true, title: true, slug: true, blocks: true, seo: true, isHome: true, updatedAt: true } as const;
type Row = { id: string; title: string; slug: string; blocks: unknown; seo: unknown; isHome: boolean; updatedAt: Date };
const toPage = (r: Row): PublicPage => ({ ...r, blocks: Array.isArray(r.blocks) ? (r.blocks as Block[]) : [], seo: (r.seo ?? {}) as Record<string, unknown> });

/** Live means published, or scheduled with a publish time that has passed. */
const live = () => ({ deletedAt: null, OR: [{ status: 'PUBLISHED' as const }, { status: 'SCHEDULED' as const, publishAt: { lte: new Date() } }] });

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('[data] page read failed, using fallback', error);
    return fallback;
  }
}

export function getPageBySlug(slug: string): Promise<PublicPage | null> {
  return safe(
    () =>
      unstable_cache(async () => {
        const row = await getDb().page.findFirst({ where: { slug, ...live() }, select });
        return row ? toPage(row) : null;
      }, ['page', slug], { tags: [TAGS.content, TAGS.type('page'), TAGS.slug(slug)], revalidate: 3600 })(),
    null,
  );
}

export function getHomePage(): Promise<PublicPage | null> {
  return safe(
    () =>
      unstable_cache(async () => {
        const row = await getDb().page.findFirst({ where: { isHome: true, ...live() }, select });
        return row ? toPage(row) : null;
      }, ['page', '__home'], { tags: [TAGS.content, TAGS.type('page')], revalidate: 3600 })(),
    null,
  );
}

/** Any status, for signed preview links only. Never cached. */
export async function getPageForPreview(id: string): Promise<PublicPage | null> {
  const row = await getDb().page.findFirst({ where: { id, deletedAt: null }, select });
  return row ? toPage(row) : null;
}

export function getFooterPages(): Promise<{ title: string; slug: string }[]> {
  return safe(
    () =>
      unstable_cache(() => getDb().page.findMany({ where: { showInFooter: true, isHome: false, ...live() }, select: { title: true, slug: true }, orderBy: { title: 'asc' }, take: 20 }), ['pages', 'footer'], {
        tags: [TAGS.content, TAGS.type('page')],
        revalidate: 3600,
      })(),
    [],
  );
}

export function getGlobalSection(id: string): Promise<{ id: string; blocks: Block[] } | null> {
  return safe(
    () =>
      unstable_cache(async () => {
        const row = await getDb().globalSection.findUnique({ where: { id } });
        return row ? { id: row.id, blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as Block[]) : [] } : null;
      }, ['global-section', id], { tags: [TAGS.content, TAGS.type('globalSection')], revalidate: 3600 })(),
    null,
  );
}

export function findRedirect(path: string): Promise<{ to: string; code: number } | null> {
  return safe(
    () =>
      unstable_cache(async () => {
        const row = await getDb().redirect.findFirst({ where: { from: path, active: true, match: 'exact' } });
        return row ? { to: row.to, code: row.code } : null;
      }, ['redirect', path], { tags: [TAGS.content, TAGS.type('redirect')], revalidate: 3600 })(),
    null,
  );
}
