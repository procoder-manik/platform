import { createHmac } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from './types';

/**
 * Development-only storage on the local disk (.uploads/). Never used in production: Vercel's disk is read-only
 * and wiped on every deploy. Uploads go to a signed route handler; files are served by /api/media/local.
 */
export const LOCAL_DIR = path.join(process.cwd(), '.uploads');

export function localSignature(key: string, expires: number): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? 'dev').update(`local:${key}:${expires}`).digest('base64url');
}

export function safeLocalPath(key: string): string {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error('Unsafe storage key.');
  return path.join(LOCAL_DIR, key);
}

export const localStorage_: StorageAdapter = {
  id: 'local',
  configured: process.env.NODE_ENV !== 'production',
  async signUpload({ key }) {
    const expires = Date.now() + 10 * 60_000;
    const qs = new URLSearchParams({ key, expires: String(expires), sig: localSignature(key, expires) });
    return { url: `/api/admin/media/local-upload?${qs}`, method: 'PUT', key };
  },
  async read(key, bytes) {
    const handle = await open(safeLocalPath(key), 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  },
  async delete(key) {
    await rm(safeLocalPath(key), { force: true });
  },
  url(key) {
    return `/api/media/local/${key}`;
  },
};

export async function writeLocal(key: string, data: Uint8Array): Promise<void> {
  const file = safeLocalPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, data);
}

export async function readLocal(key: string): Promise<Buffer> {
  return readFile(safeLocalPath(key));
}
