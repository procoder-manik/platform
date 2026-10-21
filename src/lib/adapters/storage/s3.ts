import { presign } from './sigv4';
import type { StorageAdapter } from './types';

/**
 * S3-compatible storage (Cloudflare R2, AWS S3, Backblaze B2). The browser uploads with a presigned PUT.
 * Env: S3_ENDPOINT (for R2: https://<account>.r2.cloudflarestorage.com), S3_REGION (R2: auto), S3_BUCKET,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL (the public bucket or custom domain address).
 * The bucket needs a CORS rule allowing PUT from the site address.
 */
export function createS3Storage(env: NodeJS.ProcessEnv = process.env): StorageAdapter {
  const endpoint = (env.S3_ENDPOINT ?? '').replace(/\/$/, '');
  const bucket = env.S3_BUCKET ?? '';
  const publicBase = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  const creds = { region: env.S3_REGION || 'auto', accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' };
  const configured = Boolean(endpoint && bucket && publicBase && creds.accessKeyId && creds.secretAccessKey);
  const objectUrl = (key: string) => `${endpoint}/${bucket}/${key}`;

  return {
    id: 's3',
    configured,
    async signUpload({ key, mime }) {
      const url = presign({ method: 'PUT', url: objectUrl(key), expiresSeconds: 600, headers: { 'content-type': mime }, ...creds });
      return { url, method: 'PUT', headers: { 'Content-Type': mime }, key };
    },
    async read(key, bytes) {
      const url = presign({ method: 'GET', url: objectUrl(key), expiresSeconds: 60, ...creds });
      const response = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
      if (!response.ok) throw new Error(`Storage answered ${response.status} when reading ${key}.`);
      return new Uint8Array(await response.arrayBuffer()).slice(0, bytes);
    },
    async delete(key) {
      const response = await fetch(presign({ method: 'DELETE', url: objectUrl(key), expiresSeconds: 60, ...creds }), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw new Error(`Storage answered ${response.status} when deleting ${key}.`);
    },
    url(key) {
      // S3 has no on-the-fly resizing; next/image resizes these when the host is allowed.
      return `${publicBase}/${key}`;
    },
  };
}
