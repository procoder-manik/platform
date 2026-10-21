/**
 * AES-256-GCM encryption for API keys saved in the admin.
 * The key is derived from AUTH_SECRET with HKDF, so rotating AUTH_SECRET means re-entering saved keys.
 * Format: v1.<iv>.<tag>.<ciphertext>, each part base64url.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const INFO = 'platform:secrets:v1';

function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32');
  }
  return Buffer.from(hkdfSync('sha256', secret, 'platform-secrets', INFO, 32));
}

export function encryptSecret(plain: string, secret = process.env.AUTH_SECRET ?? ''): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, secret = process.env.AUTH_SECRET ?? ''): string {
  const [version, iv, tag, body] = payload.split('.');
  if (version !== VERSION || !iv || !tag || body === undefined) {
    throw new Error('This saved key is in an unknown format. Enter it again in the admin.');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/** Shows only the last four characters, for the admin. */
export function maskSecret(plain: string): string {
  if (plain.length <= 4) return '••••';
  return `••••${plain.slice(-4)}`;
}
