import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_TENANT, FIXTURE_FIELD } from './crypto.fixtures';

describe('tenant-scoped encryption (encryptForTenant/decryptForTenant)', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.CREDENTIALS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips with tenant scoping', async () => {
    const { encryptForTenant, decryptForTenant } = await import('../crypto');
    const encrypted = encryptForTenant('tenant-scoped-secret', FIXTURE_TENANT, FIXTURE_FIELD);
    expect(decryptForTenant(encrypted, FIXTURE_TENANT, FIXTURE_FIELD)).toBe('tenant-scoped-secret');
  });

  it('produces version-prefixed payload', async () => {
    const { encryptForTenant } = await import('../crypto');
    const encrypted = encryptForTenant('version-test', FIXTURE_TENANT, FIXTURE_FIELD);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(encrypted.slice(3).split(':')).toHaveLength(3);
  });

  it('different tenants produce different ciphertext for same plaintext', async () => {
    const { encryptForTenant } = await import('../crypto');
    expect(encryptForTenant('same-secret', 'tenant-a', FIXTURE_FIELD))
      .not.toBe(encryptForTenant('same-secret', 'tenant-b', FIXTURE_FIELD));
  });

  it('different fields produce different ciphertext for same tenant', async () => {
    const { encryptForTenant } = await import('../crypto');
    expect(encryptForTenant('same-secret', FIXTURE_TENANT, 'apiKey'))
      .not.toBe(encryptForTenant('same-secret', FIXTURE_TENANT, 'apiSecret'));
  });

  it('decryptForTenant throws generic error on wrong tenant', async () => {
    const { encryptForTenant, decryptForTenant } = await import('../crypto');
    const encrypted = encryptForTenant('secret', FIXTURE_TENANT, FIXTURE_FIELD);
    expect(() => decryptForTenant(encrypted, 'wrong-tenant', FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on wrong field', async () => {
    const { encryptForTenant, decryptForTenant } = await import('../crypto');
    const encrypted = encryptForTenant('secret', FIXTURE_TENANT, 'apiKey');
    expect(() => decryptForTenant(encrypted, FIXTURE_TENANT, 'apiSecret')).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on tampered ciphertext', async () => {
    const { encryptForTenant, decryptForTenant } = await import('../crypto');
    const encrypted = encryptForTenant('secret', FIXTURE_TENANT, FIXTURE_FIELD);
    const lastColon = encrypted.lastIndexOf(':');
    const tag = encrypted.slice(lastColon + 1);
    const corruptedTag = (tag[0] === 'X' ? 'Y' : 'X') + tag.slice(1);
    const tampered = encrypted.slice(0, lastColon + 1) + corruptedTag;
    expect(() => decryptForTenant(tampered, FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on missing version prefix', async () => {
    const { decryptForTenant } = await import('../crypto');
    expect(() => decryptForTenant('no-prefix:data', FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('decryptForTenant throws generic error on malformed payload', async () => {
    const { decryptForTenant } = await import('../crypto');
    expect(() => decryptForTenant('v1:only-one-part', FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
  });

  it('throws TypeError on invalid inputs', async () => {
    const { encryptForTenant, decryptForTenant } = await import('../crypto');
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

  beforeEach(() => { vi.resetModules(); process.env = { ...originalEnv }; });

  it('decrypts with previous key when current key fails', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = PREV_KEY;
    const { encryptForTenant: encryptOld } = await import('../crypto');
    const encrypted = encryptOld('old-secret', FIXTURE_TENANT, FIXTURE_FIELD);
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = PREV_KEY;
    const { decryptForTenant: decryptFn } = await import('../crypto');
    expect(decryptFn(encrypted, FIXTURE_TENANT, FIXTURE_FIELD)).toBe('old-secret');
  });

  it('fails with generic error when neither key works', async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = CURRENT_KEY;
    const { decryptForTenant: decryptFn, encrypt } = await import('../crypto');
    const otherKey = crypto.randomBytes(32);
    const { ciphertext, iv, tag } = encrypt('other-secret', otherKey);
    expect(() => decryptFn(`v1:${ciphertext}:${iv}:${tag}`, FIXTURE_TENANT, FIXTURE_FIELD)).toThrow('decryption failed');
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
