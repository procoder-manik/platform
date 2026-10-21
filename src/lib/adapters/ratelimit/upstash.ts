import type { RateLimitAdapter } from './types';

/** Fixed-window limiter on Upstash Redis over its REST API. Shared by every server instance. */
export function createUpstashLimiter(url: string, token: string): RateLimitAdapter {
  return {
    id: 'upstash',
    async limit(key, rule) {
      const redisKey = `rl:${key}`;
      const response = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['PEXPIRE', redisKey, String(rule.windowMs), 'NX'],
          ['PTTL', redisKey],
        ]),
      });
      if (!response.ok) throw new Error(`Upstash answered ${response.status}.`);
      const [count, , ttl] = (await response.json()) as { result: number }[];
      const used = count?.result ?? 1;
      const resetAt = Date.now() + Math.max(0, ttl?.result ?? rule.windowMs);
      return { ok: used <= rule.max, remaining: Math.max(0, rule.max - used), resetAt };
    },
  };
}
