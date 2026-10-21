import 'server-only';
import { revalidateTag, updateTag } from 'next/cache';

/**
 * Refreshes cache tags after a save.
 * In a server action the change is visible on the very next read (updateTag).
 * Elsewhere (route handlers, jobs) updateTag is not allowed, so the tags expire at once instead.
 * Outside Next.js (scripts, tests) there is no cache to refresh, so nothing happens.
 */
export function refresh(tags: readonly string[]): void {
  for (const tag of new Set(tags)) {
    try {
      updateTag(tag);
    } catch {
      try {
        revalidateTag(tag, { expire: 0 });
      } catch {
        // No Next.js request context: nothing is cached here.
      }
    }
  }
}
