/** Connections per server instance. Keep it small on serverless (default 5); DATABASE_POOL_MAX overrides it. */
export function poolMax(): number {
  const value = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(value) && value > 0 ? value : 5;
}
