'use server';

import { z } from 'zod';
import { requireArea } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { HttpError } from '@/lib/http/errors';
import { getDb } from '@/lib/db';
import { decryptSecret, maskSecret } from './crypto';
import { deleteSecret, setSecret } from './secrets';
import { API_KEYS, getKeyDef } from './keys';

export interface KeyStatus {
  name: string;
  source: 'env' | 'saved' | 'none';
  /** Last four characters only. */
  masked: string | null;
}

/** Where each key comes from, without ever returning a full value. */
export async function listKeyStatus(): Promise<KeyStatus[]> {
  const saved = await getDb().secret.findMany({ where: { name: { in: API_KEYS.map((k) => k.name) } } });
  return API_KEYS.map((k) => {
    const env = process.env[k.name];
    if (env) return { name: k.name, source: 'env' as const, masked: maskSecret(env) };
    const row = saved.find((s) => s.name === k.name);
    if (!row) return { name: k.name, source: 'none' as const, masked: null };
    try {
      return { name: k.name, source: 'saved' as const, masked: maskSecret(decryptSecret(row.value)) };
    } catch {
      return { name: k.name, source: 'saved' as const, masked: 'needs re-entering' };
    }
  });
}

type Result = { ok: true; message: string } | { ok: false; message: string };

export async function saveKeyAction(name: string, value: string): Promise<Result> {
  try {
    const staff = await requireArea('apikeys');
    const def = getKeyDef(z.string().max(80).parse(name));
    if (!def) throw new HttpError(404, 'Unknown key.');
    if (process.env[def.name]) throw new HttpError(409, 'This key is set in the environment, which wins. Remove it there to manage it here.');
    const clean = z.string().trim().min(6, 'The key looks too short.').max(500).parse(value);
    if (def.pattern && !def.pattern.test(clean)) throw new HttpError(422, def.patternHint ?? 'This does not look like the right kind of key.');
    await setSecret(def.name, clean);
    await writeAudit({ userId: staff.id, action: 'apikey.save', entity: 'secret', entityId: def.name });
    return { ok: true, message: `${def.label} saved.` };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? 'This value is not valid.' };
    console.error('[apikeys] save failed', error);
    return { ok: false, message: 'The key was not saved. Check AUTH_SECRET is set and the database is reachable.' };
  }
}

export async function clearKeyAction(name: string): Promise<Result> {
  try {
    const staff = await requireArea('apikeys');
    const def = getKeyDef(name);
    if (!def) throw new HttpError(404, 'Unknown key.');
    await deleteSecret(def.name);
    await writeAudit({ userId: staff.id, action: 'apikey.clear', entity: 'secret', entityId: def.name });
    return { ok: true, message: `${def.label} removed.` };
  } catch (error) {
    return { ok: false, message: error instanceof HttpError ? error.message : 'The key was not removed.' };
  }
}
