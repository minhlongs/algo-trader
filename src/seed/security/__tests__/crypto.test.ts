import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decrypt,
  encrypt,
  generateKey,
  hashPassword,
  verifyPassword,
  encryptWithKey,
  decryptWithKey,
} from '../crypto';
import { FIXTURE_KEY } from './crypto.fixtures';

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
