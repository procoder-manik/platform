import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Secret preview tokens for drafts. They change when AUTH_SECRET changes and cannot be guessed. */
export function previewToken(entity: string, id: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? '').update(`preview:${entity}:${id}`).digest('base64url').slice(0, 32);
}

export function verifyPreviewToken(entity: string, id: string, token: string): boolean {
  const expected = Buffer.from(previewToken(entity, id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function publicPathFor(pattern: string | undefined, record: Record<string, unknown>): string | null {
  if (!pattern) return null;
  if (record.isHome === true) return '/';
  const slug = typeof record.slug === 'string' ? record.slug : '';
  return slug ? pattern.replace('{slug}', slug) : null;
}
