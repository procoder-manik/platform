import 'server-only';
import { getDb } from '@/lib/db';

export interface SavedView {
  name: string;
  href: string;
}

export const viewKey = (userId: string) => `views:${userId}`;

/** Saved list views of one staff member for one resource. Server only: never exposed as an action. */
export async function getSavedViews(userId: string, resourceId: string): Promise<SavedView[]> {
  const row = await getDb().setting.findUnique({ where: { key: viewKey(userId) } });
  return ((row?.data ?? {}) as unknown as Record<string, SavedView[]>)[resourceId] ?? [];
}
