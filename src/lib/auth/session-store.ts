import 'server-only';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/lib/db';

/** How long a staff sign-in lasts. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export async function createDbSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  return getDb().session.create({
    data: {
      sessionToken: randomBytes(32).toString('base64url'),
      userId,
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
}

export async function deleteDbSession(sessionToken: string): Promise<void> {
  await getDb().session.deleteMany({ where: { sessionToken } });
}
