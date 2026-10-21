import 'server-only';
import { getDb } from '@/lib/db';
import { decryptSecret, encryptSecret } from './crypto';

/**
 * Reads an API key: the environment variable wins, then the encrypted key store.
 * Never send the result to the browser.
 */
export async function getSecret(name: string): Promise<string | null> {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  try {
    const row = await getDb().secret.findUnique({ where: { name } });
    return row ? decryptSecret(row.value) : null;
  } catch (error) {
    console.error(`[secrets] Could not read "${name}".`, error);
    return null;
  }
}

export async function setSecret(name: string, plain: string): Promise<void> {
  const value = encryptSecret(plain);
  await getDb().secret.upsert({ where: { name }, create: { name, value }, update: { value } });
}

export async function deleteSecret(name: string): Promise<void> {
  await getDb().secret.deleteMany({ where: { name } });
}
