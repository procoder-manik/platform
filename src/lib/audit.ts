import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { getDb } from '@/lib/db';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Writes to the audit log. Never throws: a logging failure must not break the action that caused it. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        diff: entry.diff,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] Could not write audit entry.', entry.action, error);
  }
}
