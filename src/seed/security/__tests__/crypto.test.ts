import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decrypt,
  encrypt,
  decryptForTenant,
  encryptForTenant,
  generateKey,
  hashPassword,
  verifyPassword,
  validateEncryptionConfig,
  getKeyVersionInfo,
  generateMasterKey,
  encryptWithKey,
  decryptWithKey,
} from '../crypto';

// 64-char hex string = 32 bytes
const FIXTURE_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

const FIXTURE_TENANT = 'tenant-123';
const FIXTURE_FIELD = 'apiKey';

describe('crypto primitives', () => {
  describe('encrypt/decrypt', () => {
    it('round-trips a plaintext string', () => {
      const plaintext = 'super-secret-api-key-12345';
      const { ciphertext, iv, tag } = encrypt(plaintext, FIXTURE_KEY);
      const decrypted = decrypt(ciphertext, iv, tag, FIXTURE_KEY);
      expect(decrypted).toBe(plaintext);
    });

    it('produces unique IV per encryption', () => {
      const plaintext = 'same-plaintext';
      const r1 = encrypt(plaintext, FIXTURE_KEY);
      const r2 = encrypt(plaintext, FIXTURE_KEY);
      expect(r1.iv).not.toBe(r2.iv);
      expect(r1.ciphertext).not.toBe(r2.ciphertext);
    });

    it('auth tag prevents tampering', () => {
      const plaintext = 'tamper-test';
      const { ciphertext, iv, tag } = encrypt(plaintext, FIXTURE_KEY);
      const tamperedTag = Buffer.from(tag, 'base64');
      tamperedTag[0] ^= 0xff;
      expect(() => decrypt(ciphertext, iv, tamperedTag.toString('base64'), FIXTURE_KEY)).toThrow('decryption failed');
    });

    it('wrong key fails authentication', () => {
      const plaintext = 'wrong-key-test';
      const { ciphertext, iv, tag } = encrypt(plaintext, FIXTURE_KEY);
      const wrongKey = crypto.randomBytes(32);
      expect(() => decrypt(ciphertext, iv, tag, wrongKey)).toThrow('decryption failed');
    });

    it('throws TypeError on invalid plaintext type', () => {
      expect(() => encrypt(123 as unknown as string, FIXTURE_KEY)).toThrow(TypeError);
    });

    it('throws TypeError on invalid key length', () => {
      expect(() => encrypt('test', Buffer.from('short'))).toThrow(TypeError);
    });

    it('throws TypeError on invalid ciphertext/iv/tag types', () => {
      expect(() => decrypt(123 as unknown as string, 'iv', 'tag', FIXTURE_KEY)).toThrow(TypeError);
      expect(() => decrypt('ct', 123 as unknown as string, 'tag', FIXTURE_KEY)).toThrow(TypeError);
      expect(() => decrypt('ct', 'iv', 123 as unknown as string, FIXTURE_KEY)).toThrow(TypeError);
    });

    it('throws on invalid IV length', () => {
      const shortIv = Buffer.from('short').toString('base64');
      expect(() => decrypt('ciphertext', shortIv, 'tag', FIXTURE_KEY)).toThrow();
    });

    it('throws on invalid tag length', () => {
      const shortTag = Buffer.from('short').toString('base64');
      expect(() => decrypt('ciphertext', 'iv', shortTag, FIXTURE_KEY)).toThrow();
    });
  });

  describe('generateKey', () => {
    it('returns 32-byte hex string', () => {
      const key = generateKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });
  });

  describe('hashPassword/verifyPassword', () => {
    it('hashes and verifies a password', async () => {
      const password = 'correct-horse-battery-staple';
      const hash = hashPassword(password);
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });

    it('verifies against a hash with a custom provided key', async () => {
      const customKey = crypto.randomBytes(32);
      const hash = hashPassword('battery-horse', customKey);
      expect(await verifyPassword('battery-horse', hash, customKey)).toBe(true);
      expect(await verifyPassword('wrong-key', hash, customKey)).toBe(false);
    });

    it('throws TypeError on invalid password type', () => {
      expect(() => hashPassword(123 as unknown as string)).toThrow(TypeError);
    });

    it('throws TypeError on invalid hash format', () => {
      expect(() => verifyPassword('pw', 'invalid-format')).toThrow(TypeError);
    });
  });
});

describe('tenant-scoped encryption (encryptForTenant/decryptForTenant)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips with tenant scoping', () => {
    const plaintext = 'tenant-scoped-secret';
    const encrypted = encryptForTenant(plaintext, FIXTURE_TENANT, FIXTURE_FIELD);
    const decrypted = decryptForTenant(encrypted, FIXTURE_TENANT, FIXTURE_FIELD);
    expect(decrypted).toBe(plaintext);
  });

  it('produces version-prefixed payload', () => {
    const plaintext = 'version-test';
    const encrypted = encryptForTenant(plaintext, FIXTURE_TENANT, FIXTURE_FIELD);
    expect(encrypted.startsWith('v1:')).toBe(true);
    const parts = encrypted.slice(3).split(':');
    expect(parts).toHaveLength(3); // ciphertext, iv, tag
  });

  it('different tenants produce different ciphertext for same plaintext', () => {
    const plaintext = 'same-secret';
    const enc1 = encryptForTenant(plaintext, 'tenant-a', FIXTURE_FIELD);
    const enc2 = encryptForTenant(plaintext, 'tenant-b', FIXTURE_FIELD);
    expect(enc1).not.toBe(enc2);
  });

  it('different fields produce different ciphertext for same tenant', () => {
    const plaintext = 'same-secret';
    const enc1 = encryptForTenant(plaintext, FIXTURE_TENANT, 'apiKey');
    const enc2 = encryptForTenant(plaintext, FIXTURE_TENANT, 'apiSecret');
    expect(enc1).not.toBe(enc2);
  });

  it('decryptForTenant throws generic error on wrong tenant', () => {
    const plaintext = 'secret';
    const encrypted = encryptForTenant(plaintext, FIXTURE_TENANT, FIXTURE_FIELD);
    expect(() => decryptForTenant(encrypted, 'wrong-tenant', FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on wrong field', () => {
    const plaintext = 'secret';
    const encrypted = encryptForTenant(plaintext, FIXTURE_TENANT, 'apiKey');
    expect(() => decryptForTenant(encrypted, FIXTURE_TENANT, 'apiSecret')).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on tampered ciphertext', () => {
    const plaintext = 'secret';
    const encrypted = encryptForTenant(plaintext, FIXTURE_TENANT, FIXTURE_FIELD);
    // Corrupt a character in the tag portion that actually affects base64 decoding
    // Change first non-padding char of tag to 'X'
    const lastColon = encrypted.lastIndexOf(':');
    const beforeTag = encrypted.slice(0, lastColon + 1);
    const tag = encrypted.slice(lastColon + 1);
    let corruptedTag = tag;
    if (tag[0] !== '=') {
      corruptedTag = 'X' + tag.slice(1);
    } else if (tag[1] !== '=') {
      corruptedTag = tag[0] + 'X' + tag.slice(2);
    } else {
      corruptedTag = tag.slice(0, -1) + 'X';
    }
    const tampered = beforeTag + corruptedTag;
    expect(() => decryptForTenant(tampered, FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on missing version prefix', () => {
    expect(() => decryptForTenant('no-prefix:data', FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on malformed payload', () => {
    expect(() => decryptForTenant('v1:only-one-part', FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('throws TypeError on invalid inputs', () => {
    expect(() => encryptForTenant(123 as unknown as string, FIXTURE_TENANT, FIXTURE_FIELD)).toThrow(TypeError);
    expect(() => encryptForTenant('test', 123 as unknown as string, FIXTURE_FIELD)).toThrow(TypeError);
    expect(() => encryptForTenant('test', FIXTURE_TENANT, 123 as unknown as string)).toThrow(TypeError);
    expect(() => decryptForTenant(123 as unknown as string, FIXTURE_TENANT, FIXTURE_FIELD)).toThrow(TypeError);
  });
});

describe('key rotation support (dual-key read)', () => {
  const originalEnv = { ...process.env };
  const PREV_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  const CURRENT_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('decrypts with previous key when current key fails', async () => {
    // Step 1: Encrypt with the OLD key as current master key
    process.env.CREDENTIALS_ENCRYPTION_KEY = PREV_KEY;
    const { encryptForTenant: encryptOld } = await import('../crypto');
    const encrypted = encryptOld('old-secret', FIXTURE_TENANT, FIXTURE_FIELD);

    // Step 2: Set up env with NEW key as current, OLD key as previous
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = PREV_KEY;

    // Re-import to pick up new env
    const { decryptForTenant: decryptFn } = await import('../crypto');

    // Should decrypt successfully using previous key fallback
    const decrypted = decryptFn(encrypted, FIXTURE_TENANT, FIXTURE_FIELD);
    expect(decrypted).toBe('old-secret');
  });

  it('fails with generic error when neither key works', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    // No previous key set

    const { decryptForTenant: decryptFn } = await import('../crypto');

    // Encrypt with a completely different key (not current or previous)
    const otherKey = crypto.randomBytes(32);
    const { ciphertext, iv, tag } = encrypt('other-secret', otherKey);
    const payload = `v1:${ciphertext}:${iv}:${tag}`;

    expect(() => decryptFn(payload, FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('validateEncryptionConfig passes with valid key', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    const { validateEncryptionConfig: validateFn } = await import('../crypto');
    const result = validateFn();
    expect(result.currentKeyVersion).toBe(1);
    expect(result.hasPreviousKey).toBe(false);
  });

  it('validateEncryptionConfig detects previous key', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = PREV_KEY;
    const { validateEncryptionConfig: validateFn } = await import('../crypto');
    const result = validateFn();
    expect(result.currentKeyVersion).toBe(2);
    expect(result.hasPreviousKey).toBe(true);
  });

  it('validateEncryptionConfig throws on missing key', async () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_MASTER_KEY;
    const { validateEncryptionConfig: validateFn } = await import('../crypto');
    expect(() => validateFn()).toThrow('Encryption config invalid');
  });

  it('validateEncryptionConfig throws on malformed key', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = 'short';
    const { validateEncryptionConfig: validateFn } = await import('../crypto');
    expect(() => validateFn()).toThrow('Encryption config invalid');
  });

  it('getKeyVersionInfo returns version metadata without secrets', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = PREV_KEY;
    const { getKeyVersionInfo: infoFn } = await import('../crypto');
    const info = infoFn();
    expect(info.current).toBe(1);
    expect(info.previous).toBe(2);
    expect(info).not.toHaveProperty('key');
    expect(info).not.toHaveProperty('secret');
  });

  it('generateMasterKey produces valid 32-byte hex', async () => {
    const { generateMasterKey: genFn } = await import('../crypto');
    const key = genFn();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});

describe('legacy encryptString/decryptString (backward compat)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips with legacy functions', async () => {
    const { encryptString, decryptString } = await import('../crypto');
    const plaintext = 'legacy-secret';
    const encrypted = encryptString(plaintext);
    const decrypted = decryptString(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('legacy format has no version prefix', async () => {
    const { encryptString } = await import('../crypto');
    const encrypted = encryptString('test');
    expect(encrypted.startsWith('v1:')).toBe(false);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
  });
});

describe('test-only helpers', () => {
  it('encryptWithKey/decryptWithKey work with explicit key', async () => {
    const key = crypto.randomBytes(32);
    const plaintext = 'explicit-key-test';
    const { encryptWithKey, decryptWithKey } = await import('../crypto');
    const encrypted = encryptWithKey(plaintext, key);
    const decrypted = decryptWithKey(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encryptWithKey produces different output per call', async () => {
    const key = crypto.randomBytes(32);
    const { encryptWithKey } = await import('../crypto');
    const e1 = encryptWithKey('same', key);
    const e2 = encryptWithKey('same', key);
    expect(e1).not.toBe(e2);
  });
});