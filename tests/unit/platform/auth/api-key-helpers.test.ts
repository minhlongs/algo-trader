/**
 * API Key Helpers — Unit Tests
 *
 * Covers generateApiKey (randomBytes for key + salt, scrypt hashing, INSERT),
 * verifyApiKey (valid / no-separator / length-mismatch / scrypt throw /
 * timingSafeEqual false), listApiKeys, revokeApiKey (updated / not-found /
 * missing rowCount), findActiveKeysByPrefix, getApiKeyById (found / null).
 *
 * node:util promisify is mocked as identity so scryptAsync === mocked scrypt
 * (the real promisify would append a callback the vi.fn never calls → hang).
 * randomBytes is stubbed per-call: 1st = raw key bytes, 2nd = salt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  randomBytes: vi.fn(),
  randomUUID: vi.fn(),
  scrypt: vi.fn(),
  timingSafeEqual: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: mocks.randomBytes,
    randomUUID: mocks.randomUUID,
    scrypt: mocks.scrypt,
    timingSafeEqual: mocks.timingSafeEqual,
  };
});

vi.mock('../../../../src/shared/db/postgres-client', () => ({
  getDbClient: () => ({ query: mocks.dbQuery }),
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { generateApiKey, verifyApiKey, listApiKeys, revokeApiKey, findActiveKeysByPrefix, getApiKeyById } from '../../../../src/platform/auth/api-key-helpers';

const TENANT = 't-1';

/** Stub randomBytes for one generateApiKey call: raw key bytes, then salt. */
function stubKeyGeneration(raw: Buffer, salt: Buffer) {
  mocks.randomBytes.mockReturnValueOnce(raw).mockReturnValueOnce(salt);
}

describe('api-key-helpers', () => {
  beforeEach(() => {
    mocks.randomBytes.mockReset();
    mocks.randomUUID.mockReset();
    mocks.scrypt.mockReset();
    mocks.timingSafeEqual.mockReset();
    mocks.dbQuery.mockReset();
  });

  // ── generateApiKey ────────────────────────────────────────────────────

  it('generates a key, hashes it, and persists a row with all metadata', async () => {
    const raw = Buffer.from('my-raw-key-material', 'utf8');
    const salt = Buffer.from('aabbccdd', 'hex');
    stubKeyGeneration(raw, salt);
    mocks.scrypt.mockResolvedValueOnce(Buffer.from('derived1', 'utf8'));
    mocks.randomUUID.mockReturnValueOnce('key-id-1');
    mocks.dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await generateApiKey(TENANT, 'My Key', new Date('2026-12-31T00:00:00Z'));

    const expectedKey = raw.toString('base64url');
    expect(res.fullKey).toBe(`${expectedKey.slice(0, 8)}.${expectedKey}`);
    expect(res.keyPrefix).toBe(expectedKey.slice(0, 8));
    expect(res.keyHash).toBe('aabbccdd:' + Buffer.from('derived1', 'utf8').toString('hex'));
    expect(res.id).toBe('key-id-1');
    expect(res.tenantId).toBe(TENANT);
    expect(res.label).toBe('My Key');
    expect(res.createdAt).toBeInstanceOf(Date);

    const [sql, params] = mocks.dbQuery.mock.calls[0]!;
    expect(sql).toContain('INSERT INTO api_keys');
    expect(params).toEqual(['key-id-1', TENANT, 'My Key', res.keyPrefix, res.keyHash, new Date('2026-12-31T00:00:00Z')]);
  });

  it('persists expiresAt as null when not provided', async () => {
    stubKeyGeneration(Buffer.from('raw', 'utf8'), Buffer.from('aa', 'hex'));
    mocks.scrypt.mockResolvedValueOnce(Buffer.from('d', 'utf8'));
    mocks.randomUUID.mockReturnValueOnce('id-2');
    mocks.dbQuery.mockResolvedValueOnce({ rows: [] });

    await generateApiKey(TENANT, 'No-expiry');

    expect(mocks.dbQuery.mock.calls[0]![1]).toEqual(
      ['id-2', TENANT, 'No-expiry', expect.any(String), expect.any(String), null],
    );
  });

  // ── verifyApiKey ──────────────────────────────────────────────────────

  it('returns true when the plaintext key matches the stored hash', async () => {
    mocks.scrypt.mockResolvedValueOnce(Buffer.alloc(4));
    mocks.timingSafeEqual.mockReturnValueOnce(true);
    expect(await verifyApiKey('k', 'salt:aabbccdd')).toBe(true);
    expect(mocks.timingSafeEqual).toHaveBeenCalled();
  });

  it('returns false when the stored value has no salt:hash separator', async () => {
    expect(await verifyApiKey('k', 'no-colon-here')).toBe(false);
    expect(mocks.scrypt).not.toHaveBeenCalled();
  });

  it('returns false when derived key length differs from stored hash', async () => {
    mocks.scrypt.mockResolvedValueOnce(Buffer.alloc(6));
    expect(await verifyApiKey('k', 'salt:aabbccdd')).toBe(false); // 4 bytes vs 6
    expect(mocks.timingSafeEqual).not.toHaveBeenCalled();
  });

  it('returns false when scrypt throws', async () => {
    mocks.scrypt.mockRejectedValueOnce(new Error('crypto down'));
    expect(await verifyApiKey('k', 'salt:aabbccdd')).toBe(false);
  });

  it('returns false when timingSafeEqual returns false', async () => {
    mocks.scrypt.mockResolvedValueOnce(Buffer.alloc(4));
    mocks.timingSafeEqual.mockReturnValueOnce(false);
    expect(await verifyApiKey('k', 'salt:aabbccdd')).toBe(false);
  });

  // ── listApiKeys ──────────────────────────────────────────────────────

  it('maps DB rows to the masked key listing shape', async () => {
    mocks.dbQuery.mockResolvedValueOnce({ rows: [
      { id: 'k1', label: 'A', key_prefix: 'pk1', last_used_at: null, created_at: '2026-01-01', revoked_at: null, expires_at: null },
      { id: 'k2', label: 'B', key_prefix: 'pk2', last_used_at: '2026-02-02', created_at: '2026-01-02', revoked_at: '2026-03-03', expires_at: '2026-04-04' },
    ] });

    const rows = await listApiKeys(TENANT);

    expect(rows).toEqual([
      { id: 'k1', label: 'A', keyPrefix: 'pk1', lastUsedAt: null, createdAt: '2026-01-01', revokedAt: null, expiresAt: null },
      { id: 'k2', label: 'B', keyPrefix: 'pk2', lastUsedAt: '2026-02-02', createdAt: '2026-01-02', revokedAt: '2026-03-03', expiresAt: '2026-04-04' },
    ]);
    const [sql, params] = mocks.dbQuery.mock.calls[0]!;
    expect(sql).toContain('FROM api_keys');
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([TENANT]);
  });

  // ── revokeApiKey ──────────────────────────────────────────────────────

  it('returns true when a row is revoked and false when rowCount is 0', async () => {
    mocks.dbQuery.mockResolvedValueOnce({ rowCount: 1 });
    expect(await revokeApiKey('k1', TENANT)).toBe(true);

    mocks.dbQuery.mockResolvedValueOnce({ rowCount: 0 });
    expect(await revokeApiKey('k1', TENANT)).toBe(false);

    const [sql, params] = mocks.dbQuery.mock.calls[0]!;
    expect(sql).toContain('UPDATE api_keys SET revoked_at');
    expect(params).toEqual(['k1', TENANT]);
  });

  it('returns false when rowCount is missing (defensive default)', async () => {
    mocks.dbQuery.mockResolvedValueOnce({});
    expect(await revokeApiKey('k1', TENANT)).toBe(false);
  });

  // ── findActiveKeysByPrefix ────────────────────────────────────────────

  it('maps active-key rows with full hash data', async () => {
    mocks.dbQuery.mockResolvedValueOnce({ rows: [
      { id: 'k1', tenant_id: 't-1', label: 'A', key_hash: 'salt:hash', revoked_at: null, expires_at: null },
    ] });

    const rows = await findActiveKeysByPrefix('pk1');

    expect(rows).toEqual([{ id: 'k1', tenantId: 't-1', label: 'A', keyHash: 'salt:hash', revokedAt: null, expiresAt: null }]);
    expect(mocks.dbQuery.mock.calls[0]![1]).toEqual(['pk1']);
  });

  it('returns an empty array when no active keys match the prefix', async () => {
    mocks.dbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await findActiveKeysByPrefix('ghost')).toEqual([]);
  });

  // ── getApiKeyById ─────────────────────────────────────────────────────

  it('returns a single key by id and null when not found', async () => {
    mocks.dbQuery.mockResolvedValueOnce({ rows: [{ id: 'k1', tenant_id: 't-1', label: 'A', created_at: '2026-01-01' }] });
    expect(await getApiKeyById('k1')).toEqual({ id: 'k1', tenantId: 't-1', label: 'A', createdAt: '2026-01-01' });

    mocks.dbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getApiKeyById('k1')).toBeNull();
  });
});