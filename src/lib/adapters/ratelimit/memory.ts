import type { RateLimitAdapter } from './types';

/**
 * Fixed-window limiter kept in memory. Good for development and a single server.
 * On serverless each instance counts on its own; set Upstash for shared limits.
 */
export function createMemoryLimiter(now: () => number = Date.now): RateLimitAdapter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    id: 'memory',
    async limit(key, rule) {
      const t = now();
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + rule.windowMs });
        return { ok: true, remaining: rule.max - 1, resetAt: t + rule.windowMs };
      }
      entry.count += 1;
      return { ok: entry.count <= rule.max, remaining: Math.max(0, rule.max - entry.count), resetAt: entry.resetAt };
    },
  };
}
