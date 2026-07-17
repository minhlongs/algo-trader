import crypto from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decrypt,
  encrypt,
  generateKey,
  hashPassword,
  verifyPassword,
} from '../crypto';

// 64-char hex string = 32 bytes
const FIXTURE_KEY = Buffer.from(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'hex',
);

describe('src/seed/security/crypto', () => {
  // ---------------------------------------------------------------------------
  // generateKey
  // ---------------------------------------------------------------------------
  describe('generateKey', () => {
    it('returns a 32-byte Buffer', () => {
      const key = generateKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('produces different keys on each call', () => {
      const a = generateKey();
      const b = generateKey();
      expect(a.equals(b)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // encrypt / decrypt round-trip
  // ---------------------------------------------------------------------------
  describe('encrypt + decrypt round-trip', () => {
    it('round-trips ASCII text', async () => {
      const result = encrypt('hello world', FIXTURE_KEY);
      expect(await decrypt(result.ciphertext, result.iv, result.tag, FIXTURE_KEY)).toBe(
        'hello world',
      );
    });

    it('round-trips Vietnamese text with diacritics', async () => {
      const plain = 'Xin chào Sophia — nhà máy AI!';
      const result = encrypt(plain, FIXTURE_KEY);
      expect(await decrypt(result.ciphertext, result.iv, result.tag, FIXTURE_KEY)).toBe(plain);
    });

    it('round-trips empty string', async () => {
      const result = encrypt('', FIXTURE_KEY);
      expect(await decrypt(result.ciphertext, result.iv, result.tag, FIXTURE_KEY)).toBe('');
    });

    it('round-trips a 10 KB payload', async () => {
      const plain = 'x'.repeat(10_000);
      const result = encrypt(plain, FIXTURE_KEY);
      expect(await decrypt(result.ciphertext, result.iv, result.tag, FIXTURE_KEY)).toBe(plain);
    });

    it('produces distinct ciphertexts for the same plaintext', async () => {
      const a = encrypt('same', FIXTURE_KEY);
      const b = encrypt('same', FIXTURE_KEY);
      expect(a.ciphertext).not.toBe(b.ciphertext);
      expect(a.iv).not.toBe(b.iv);
      expect(await decrypt(a.ciphertext, a.iv, a.tag, FIXTURE_KEY)).toBe('same');
      expect(await decrypt(b.ciphertext, b.iv, b.tag, FIXTURE_KEY)).toBe('same');
    });
  });

  // ---------------------------------------------------------------------------
  // tamper / invalid-key rejection
  // ---------------------------------------------------------------------------
  describe('security: tamper detection', () => {
    it('rejects wrong key', () => {
      const { ciphertext, iv, tag } = encrypt('secret', FIXTURE_KEY);
      const wrongKey = Buffer.from(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        'hex',
      );
      expect(() => decrypt(ciphertext, iv, tag, wrongKey)).toThrow('decryption failed');
    });

    it('rejects tampered ciphertext', async () => {
      const { ciphertext, iv, tag } = encrypt('secret', FIXTURE_KEY);
      const bad = Buffer.from(ciphertext, 'base64');
      bad[0] ^= 0xff;
      expect(() =>
        decrypt(bad.toString('base64'), iv, tag, FIXTURE_KEY),
      ).toThrow('decryption failed');
    });

    it('rejects tampered IV', async () => {
      const { ciphertext, iv, tag } = encrypt('secret', FIXTURE_KEY);
      const bad = Buffer.from(iv, 'base64');
      bad[0] ^= 0xff;
      expect(() =>
        decrypt(ciphertext, bad.toString('base64'), tag, FIXTURE_KEY),
      ).toThrow();
    });

    it('rejects tampered auth tag', async () => {
      const { ciphertext, iv, tag } = encrypt('secret', FIXTURE_KEY);
      const bad = Buffer.from(tag, 'base64');
      bad[0] ^= 0xff;
      expect(() =>
        decrypt(ciphertext, iv, bad.toString('base64'), FIXTURE_KEY),
      ).toThrow('decryption failed');
    });

    it('rejects malformed base64 ciphertext', async () => {
      const badIv = crypto.randomBytes(12).toString('base64');
      const badTag = crypto.randomBytes(16).toString('base64');
      expect(() =>
        decrypt('not-valid-base64!!!', badIv, badTag, FIXTURE_KEY),
      ).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // input validation
  // ---------------------------------------------------------------------------
  describe('input validation', () => {
    it('rejects non-32-byte key to encrypt', () => {
      expect(() => encrypt('test', Buffer.alloc(16))).toThrow('key must be 32 bytes');
      expect(() => encrypt('test', Buffer.alloc(64))).toThrow('key must be 32 bytes');
    });

    it('rejects non-string plaintext', () => {
      expect(() => encrypt(123 as unknown as string, FIXTURE_KEY)).toThrow(
        'plaintext must be a string',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // hashPassword / verifyPassword
  // ---------------------------------------------------------------------------
  describe('hashPassword + verifyPassword', () => {
    beforeEach(() => {
      process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 0xab).toString('hex');
    });

    it('returns true for the correct password', async () => {
      const hash = hashPassword('my-super-secret');
      expect(hash).toMatch(/^\d+:[\w+/=]+:[\w+/=]+:[\w+/=]+:[\w+/=]+$/);
      expect(await verifyPassword('my-super-secret', hash)).toBe(true);
    });

    it('returns false for a wrong password', async () => {
      const hash = hashPassword('correct-horse');
      expect(await verifyPassword('wrong-password', hash)).toBe(false);
    });

    it('returns false for malformed hash (too few segments)', () => {
      expect(verifyPassword('pw', 'too:few')).toBe(false);
    });

    it('throws on non-string password', () => {
      const hash = hashPassword('pw');
      expect(() => verifyPassword(123 as unknown as string, hash)).toThrow(
        'password must be a string',
      );
    });

    it('throws on non-string hash', () => {
      expect(() => verifyPassword('pw', 123 as unknown as string)).toThrow(
        'hash must be a string',
      );
    });

    it('produces different hashes for the same password (random salt)', async () => {
      const a = hashPassword('shared-secret');
      const b = hashPassword('shared-secret');
      expect(a).not.toBe(b);
      expect(await verifyPassword('shared-secret', a)).toBe(true);
      expect(await verifyPassword('shared-secret', b)).toBe(true);
    });

    it('throws if ENCRYPTION_MASTER_KEY is missing', () => {
      const orig = process.env.CREDENTIALS_ENCRYPTION_KEY;
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(() => hashPassword('pw')).toThrow('ENCRYPTION_MASTER_KEY');
      if (orig) process.env.CREDENTIALS_ENCRYPTION_KEY = orig;
    });

    it('verifies against a hash with a custom provided key', async () => {
      const customKey = crypto.randomBytes(32);
      const hash = hashPassword('battery-horse', customKey);
      expect(await verifyPassword('battery-horse', hash, customKey)).toBe(true);
      expect(await verifyPassword('wrong-key', hash, customKey)).toBe(false);
    });
  });
});
