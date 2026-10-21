import 'server-only';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id with OWASP-recommended settings (19 MiB memory, 2 passes). */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
