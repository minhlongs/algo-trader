import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from './credentials-crypto';

describe('credentials-crypto round-trip (src/lib/credentials.test.ts)', () => {
  const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012';
  });
  afterEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
  });

  it('round-trip encrypt/decrypt preserves plaintext', () => {
    const plaintext = 'my-credential-value-xyz';
    const encrypted = encrypt(plaintext);
    expect(encrypted.split(':')).toHaveLength(3);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypt produces distinct ciphertext on each call', () => {
    const a = encrypt('same-input');
    const b = encrypt('same-input');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same-input');
    expect(decrypt(b)).toBe('same-input');
  });
});
