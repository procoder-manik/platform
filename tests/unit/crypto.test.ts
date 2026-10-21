import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret } from '@/lib/security/crypto';

const secret = 'a'.repeat(40);

describe('saved key encryption', () => {
  it('round-trips', () => {
    const payload = encryptSecret('sk_test_123456', secret);
    expect(payload.startsWith('v1.')).toBe(true);
    expect(payload).not.toContain('sk_test');
    expect(decryptSecret(payload, secret)).toBe('sk_test_123456');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('same', secret)).not.toBe(encryptSecret('same', secret));
  });

  it('fails with a different auth secret', () => {
    const payload = encryptSecret('value', secret);
    expect(() => decryptSecret(payload, 'b'.repeat(40))).toThrow();
  });

  it('fails when the ciphertext is changed', () => {
    const parts = encryptSecret('value', secret).split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), secret)).toThrow();
  });

  it('refuses a short auth secret', () => {
    expect(() => encryptSecret('value', 'short')).toThrow(/32 characters/);
  });

  it('masks all but the last four characters', () => {
    expect(maskSecret('sk_live_abcd1234')).toBe('••••1234');
    expect(maskSecret('abc')).toBe('••••');
  });
});
