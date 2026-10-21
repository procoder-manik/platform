import { createMemoryLimiter } from './memory';
import { createUpstashLimiter } from './upstash';
import type { RateLimitAdapter, RateLimitResult } from './types';

export type { RateLimitAdapter, RateLimitResult } from './types';

let instance: RateLimitAdapter | null = null;
const fallback = createMemoryLimiter();

function pick(): RateLimitAdapter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? createUpstashLimiter(url, token) : fallback;
}

/** Limits by key. If Redis fails, the memory limiter takes over so sign-in keeps working. */
export async function rateLimit(key: string, rule: { max: number; windowMs: number }): Promise<RateLimitResult> {
  instance ??= pick();
  try {
    return await instance.limit(key, rule);
  } catch (error) {
    console.error('[ratelimit] Provider failed, using memory.', error);
    return fallback.limit(key, rule);
  }
}
