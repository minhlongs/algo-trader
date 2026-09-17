/**
 * Test suite for src/seed/security/audit-log
 *
 * All DB calls are mocked via `vi.mock('../../../db/postgres-client')`.
 * No live PostgreSQL required.
 */

import crypto from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock pg pool -- must come before any import from the module under test
// ---------------------------------------------------------------------------
vi.mock('../../../db/postgres-client', () => ({
  query: vi.fn(),
}));

// Set required env before importing the module
process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64); // 64 hex chars = 32 bytes

import { query } from '../../../db/postgres-client';
import {
  hashIpAddress,
  logAudit,
} from '../audit-log';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal, valid IAuditEntry with sensible defaults */
function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: 'user-1',
    action: 'api_keys.create',
    resource: 'ApiKey:42',
    result: 'success',
    metadata: { tier: 'PRO' },
    ipHash: hashIpAddress('10.0.0.1'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===================================================================
// logAudit
// ===================================================================

describe('logAudit', () => {
  it('calls query with INSERT SQL and all entry fields', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    const entry = makeEntry() as Parameters<typeof logAudit>[0];
    await logAudit(entry);

    // Should be called at least once (dead letter queue may cause retries)
    expect(query).toHaveBeenCalled();
    const calls = (query as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const insertCall = calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'));
    expect(insertCall).toBeDefined();
    const [, params] = insertCall!;
    expect(params).toHaveLength(12); // Now includes sequence_number, hash, previous_hash
    expect(params[0]).toBe(entry.id);
    expect(params[3]).toBe(entry.action);
    expect(params[4]).toBe(entry.resource);
    expect(params[7]).toBe(entry.ipHash);
    expect(params[8]).toBe(entry.tenantId ?? null);
  });

  it('rejects empty id', async () => {
    await expect(logAudit(makeEntry({ id: '' }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('id must be a non-empty string');
  });

  it('rejects empty action', async () => {
    await expect(logAudit(makeEntry({ action: '' }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('action must be a non-empty string');
  });

  it('rejects empty resource', async () => {
    await expect(logAudit(makeEntry({ resource: '' }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('resource must be a non-empty string');
  });

  it('rejects empty ipHash', async () => {
    await expect(logAudit(makeEntry({ ipHash: '' }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('ipHash must be a non-empty');
  });

  it('rejects invalid result value', async () => {
    await expect(logAudit(makeEntry({ result: 'warning' }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('result must be one of');
  });

  it('rejects non-string timestamp', async () => {
    await expect(logAudit(makeEntry({ timestamp: 123 }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('timestamp must be an ISO-8601 string');
  });

  it('rejects non-string actor', async () => {
    await expect(logAudit(makeEntry({ actor: null as unknown as string }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('actor must be a non-empty string');
  });

  it('rejects metadata exceeding 4 kB', async () => {
    const bigMeta = { payload: 'x'.repeat(5_000) };
    await expect(logAudit(makeEntry({ metadata: bigMeta }) as Parameters<typeof logAudit>[0]))
      .rejects.toThrow('metadata exceeds');
  });

  it('accepts valid metadata under 4 kB', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    const entry = makeEntry({ metadata: { note: 'hello' } }) as Parameters<typeof logAudit>[0];
    await expect(logAudit(entry)).resolves.toBeUndefined();
  });
});

// ===================================================================
// hashIpAddress
// ===================================================================

describe('hashIpAddress', () => {
  it('is deterministic', () => {
    const h1 = hashIpAddress('10.0.0.1');
    const h2 = hashIpAddress('10.0.0.1');
    expect(h1).toBe(h2);
    expect(h1).not.toBe('10.0.0.1');
  });

  it('returns 64-char hex', () => {
    const h = hashIpAddress('198.51.100.42');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different IPs → different hashes', () => {
    expect(hashIpAddress('10.0.0.1')).not.toBe(hashIpAddress('10.0.0.2'));
  });

  it('normalises undefined / null / empty to constant', () => {
    const a = hashIpAddress(undefined);
    const b = hashIpAddress(null);
    const c = hashIpAddress('');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
