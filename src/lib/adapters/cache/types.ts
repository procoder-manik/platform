/** Small key-value cache for hot values (Phase 14 adds Upstash). Page caching uses Next.js cache tags instead. */
export interface CacheAdapter {
  readonly id: string;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}
