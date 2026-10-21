export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitAdapter {
  readonly id: string;
  limit(key: string, rule: { max: number; windowMs: number }): Promise<RateLimitResult>;
}
