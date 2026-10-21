import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';
import { TAGS } from '@/lib/cache/tags';
import { mergeOverDefaults } from '@/lib/utils/merge';
import type { SettingsGroup } from './define';

async function readRaw(key: string): Promise<unknown> {
  const row = await getDb().setting.findUnique({ where: { key } });
  return row?.data ?? null;
}

/**
 * Reads a settings group, merged over its defaults. Cached with the `settings` tag.
 * If the database is unreachable the defaults are returned, so public pages never crash.
 * Errors are not cached: the next read tries the database again.
 */
export async function getSetting<T>(group: SettingsGroup<T>): Promise<T> {
  const cached = unstable_cache(() => readRaw(group.key), ['setting', group.key], {
    tags: [TAGS.settings, TAGS.setting(group.key)],
    revalidate: 3600,
  });
  try {
    // Outside a Next.js request (scripts, tests) there is no data cache: read directly.
    const raw = await cached().catch((error: unknown) => {
      if (error instanceof Error && error.message.includes('incrementalCache missing')) return readRaw(group.key);
      throw error;
    });
    const merged = mergeOverDefaults(group.defaults, raw);
    const parsed = group.schema.safeParse(merged);
    return parsed.success ? parsed.data : group.defaults;
  } catch (error) {
    console.error(`[settings] Could not read "${group.key}", using defaults.`, error);
    return group.defaults;
  }
}

/** Validates and saves a settings group. Callers refresh the cache tags afterwards. */
export async function saveSetting<T>(group: SettingsGroup<T>, value: unknown): Promise<T> {
  const data = group.schema.parse(mergeOverDefaults(group.defaults, value));
  const json = data as Prisma.InputJsonValue;
  await getDb().setting.upsert({
    where: { key: group.key },
    create: { key: group.key, data: json },
    update: { data: json },
  });
  return data;
}
