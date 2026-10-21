import { randomBytes } from 'node:crypto';

const NUMBER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Looks like WL-261019-K7QX: prefix, date and four characters that are easy to read out loud. */
export function orderNumber(prefix: string, date = new Date()): string {
  const d = date.toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = randomBytes(4);
  return `${prefix}-${d}-${[...bytes].map((b) => NUMBER_CHARS[b % NUMBER_CHARS.length]).join('')}`;
}
