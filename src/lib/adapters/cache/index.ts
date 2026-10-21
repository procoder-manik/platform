import type { CacheAdapter } from './types';

export type { CacheAdapter } from './types';

const store = new Map<string, { value: unknown; expires: number }>();

export const memoryCache: CacheAdapter = {
  id: 'memory',
  async get<T>(key: string) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return hit.value as T;
  },
  async set(key, value, ttlMs) {
    store.set(key, { value, expires: Date.now() + ttlMs });
  },
  async delete(key) {
    store.delete(key);
  },
};

export function getCache(): CacheAdapter {
  return memoryCache;
}
