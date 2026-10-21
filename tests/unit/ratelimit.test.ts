import { describe, expect, it } from 'vitest';
import { createMemoryLimiter } from '@/lib/adapters/ratelimit/memory';

describe('memory rate limiter', () => {
  it('blocks after the limit and resets after the window', async () => {
    let now = 1_000;
    const limiter = createMemoryLimiter(() => now);
    const rule = { max: 2, windowMs: 1_000 };
    expect((await limiter.limit('k', rule)).ok).toBe(true);
    expect((await limiter.limit('k', rule)).ok).toBe(true);
    expect((await limiter.limit('k', rule)).ok).toBe(false);
    now += 1_001;
    expect((await limiter.limit('k', rule)).ok).toBe(true);
  });

  it('counts keys separately', async () => {
    const limiter = createMemoryLimiter();
    const rule = { max: 1, windowMs: 60_000 };
    expect((await limiter.limit('a', rule)).ok).toBe(true);
    expect((await limiter.limit('b', rule)).ok).toBe(true);
  });
});
