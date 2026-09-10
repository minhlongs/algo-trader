/**
 * Tests for audit-trail-queries — getAuditTrail, verifyAuditChain, getAuditTrailByTenant.
 *
 * All DB calls mocked; no live PostgreSQL required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAuditEntry } from '../../../../src/seed/security/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const {
  mockQuery,
  mockMapRowToEntry,
  mockInitHmacKey,
  mockComputeRowHash,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMapRowToEntry: vi.fn(),
  mockInitHmacKey: vi.fn(),
  mockComputeRowHash: vi.fn(),
}));

vi.mock('../../../../src/db/postgres-client', () => ({ query: mockQuery }));
vi.mock('../../../../src/seed/security/audit-validate', () => ({ mapRowToEntry: mockMapRowToEntry }));
vi.mock('../../../../src/seed/security/audit-hmac-key', () => ({ initHmacKey: mockInitHmacKey }));
vi.mock('../../../../src/seed/security/audit-hash-chain', () => ({ computeRowHash: mockComputeRowHash }));

import {
  getAuditTrail,
  verifyAuditChain,
  getAuditTrailByTenant,
} from '../../../../src/seed/security/audit-trail-queries';

// ── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_KEY = Buffer.alloc(32, 'k');

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'row-1',
    timestamp: '2026-01-01T00:00:00Z',
    actor: 'user-1',
    action: 'api_keys.create',
    resource: 'ApiKey:42',
    result: 'success',
    metadata: '{}',
    ip_hash: 'abc123',
    tenant_id: 'tenant-1',
    sequence_number: 1,
    hash: 'h1',
    previous_hash: '',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<IAuditEntry> = {}): IAuditEntry {
  return {
    id: 'row-1',
    timestamp: '2026-01-01T00:00:00Z',
    actor: 'user-1',
    action: 'api_keys.create',
    resource: 'ApiKey:42',
    result: 'success',
    metadata: {},
    ipHash: 'abc123',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMapRowToEntry.mockImplementation((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    actor: row.actor,
    action: row.action,
    resource: row.resource,
    result: row.result,
    metadata: row.metadata ?? {},
    ipHash: row.ip_hash,
    tenantId: row.tenant_id,
  }));
  mockInitHmacKey.mockReturnValue(MOCK_KEY);
  mockComputeRowHash.mockReturnValue('computed-hash');
});

// ── getAuditTrail ────────────────────────────────────────────────────────────

describe('getAuditTrail', () => {
  it('throws TypeError on empty resource', async () => {
    await expect(getAuditTrail('')).rejects.toThrow(TypeError);
    await expect(getAuditTrail('')).rejects.toThrow('resource must be a non-empty string');
  });

  it('throws TypeError on non-string resource', async () => {
    await expect(getAuditTrail(null as unknown as string)).rejects.toThrow(TypeError);
    await expect(getAuditTrail(42 as unknown as string)).rejects.toThrow(TypeError);
  });

  // Number(0) || 100 → 100 (0 is falsy); negative → 1
  it('clamps limit of 0 to 100 (falsy fallback)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', 0);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[params.length - 1]).toBe(100);
  });

  it('clamps negative limit to 1', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', -5);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[params.length - 1]).toBe(1);
  });

  it('clamps limit > 100 to 100', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', 9999);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[params.length - 1]).toBe(100);
  });

  it('defaults limit to 100 when NaN', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', NaN);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[params.length - 1]).toBe(100);
  });

  it('uses default limit of 100', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1');
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('adds tenant_id filter when tenantId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', 10, 'tenant-A');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('AND tenant_id = $2');
    expect(params).toEqual(['ApiKey:1', 'tenant-A', 10]);
  });

  it('does not add tenant_id filter when tenantId is undefined', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', 10);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('AND tenant_id');
    expect(params).toEqual(['ApiKey:1', 10]);
  });

  it('maps rows via mapRowToEntry', async () => {
    const row = makeRow();
    mockQuery.mockResolvedValue({ rows: [row] });
    const mapped = makeEntry();
    mockMapRowToEntry.mockReturnValue(mapped);

    const results = await getAuditTrail('ApiKey:1', 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(mapped);
    expect(mockMapRowToEntry).toHaveBeenCalledWith(row);
  });

  it('returns empty array when no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const results = await getAuditTrail('ApiKey:1');
    expect(results).toEqual([]);
  });

  it('passes correct SQL with ORDER BY and LIMIT', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrail('ApiKey:1', 50);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY sequence_number DESC');
    expect(sql).toContain('LIMIT');
  });
});

// ── verifyAuditChain ─────────────────────────────────────────────────────────

describe('verifyAuditChain', () => {
  it('returns { valid: true } for empty audit log', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: true } for a consistent single-row chain', async () => {
    const row = makeRow({ sequence_number: 1, hash: 'h1', previous_hash: '' });
    mockQuery.mockResolvedValue({ rows: [row] });
    mockComputeRowHash.mockReturnValue('h1');

    const result = await verifyAuditChain('tenant-1');
    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: true } for multi-row chain with matching hashes', async () => {
    const rows = [
      makeRow({ id: 'r1', sequence_number: 1, hash: 'h1', previous_hash: '' }),
      makeRow({ id: 'r2', sequence_number: 2, hash: 'h2', previous_hash: 'h1' }),
    ];
    mockQuery.mockResolvedValue({ rows });
    mockComputeRowHash.mockReturnValueOnce('h1').mockReturnValueOnce('h2');

    const result = await verifyAuditChain('tenant-1');
    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: false } on sequence gap', async () => {
    const rows = [
      makeRow({ id: 'r1', sequence_number: 1, hash: 'h1', previous_hash: '' }),
      makeRow({ id: 'r2', sequence_number: 3, hash: 'h2', previous_hash: 'h1' }),
    ];
    mockQuery.mockResolvedValue({ rows });
    mockComputeRowHash.mockReturnValue('h1');

    const result = await verifyAuditChain('tenant-1');
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.reason).toContain('Sequence gap');
    expect(result.reason).toContain('expected 2');
    expect(result.reason).toContain('got 3');
  });

  it('returns { valid: false } on hash mismatch', async () => {
    const rows = [
      makeRow({ id: 'r1', sequence_number: 1, hash: 'h1', previous_hash: '' }),
      makeRow({ id: 'r2', sequence_number: 2, hash: 'h2', previous_hash: 'h1' }),
    ];
    mockQuery.mockResolvedValue({ rows });
    // First hash matches, second doesn't
    mockComputeRowHash.mockReturnValueOnce('h1').mockReturnValueOnce('wrong-hash');

    const result = await verifyAuditChain('tenant-1');
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toContain('Hash mismatch');
    expect(result.reason).toContain('sequence 2');
  });

  it('handles __system__ tenant (null tenant_id)', async () => {
    const rows = [
      makeRow({ id: 'r1', tenant_id: null, sequence_number: 1, hash: 'h1', previous_hash: '' }),
    ];
    mockQuery.mockResolvedValue({ rows });
    mockComputeRowHash.mockReturnValue('h1');

    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: true });
    expect(mockComputeRowHash).toHaveBeenCalledWith(
      MOCK_KEY,
      undefined, // __system__ tenant → undefined
      1,
      '',
      expect.objectContaining({ id: 'r1' }),
    );
  });

  it('adds tenant_id filter when tenantId is provided', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await verifyAuditChain('tenant-X');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('WHERE tenant_id = $1');
    expect(params).toEqual(['tenant-X']);
  });

  it('no tenant_id filter when tenantId is undefined', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await verifyAuditChain();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('WHERE');
    expect(params).toEqual([]);
  });

  it('verifies hash with correct entry fields', async () => {
    const row = makeRow({
      id: 'r1',
      action: 'test.action',
      resource: 'Test:1',
      result: 'failure',
      metadata: '{"key":"val"}',
      sequence_number: 1,
      hash: 'h1',
      previous_hash: '',
    });
    mockQuery.mockResolvedValue({ rows: [row] });
    mockComputeRowHash.mockReturnValue('h1');

    await verifyAuditChain('tenant-1');
    expect(mockComputeRowHash).toHaveBeenCalledWith(
      MOCK_KEY,
      'tenant-1',
      1,
      '',
      expect.objectContaining({
        id: 'r1',
        action: 'test.action',
        resource: 'Test:1',
        result: 'failure',
      }),
    );
  });

  it('parses metadata JSON string from row', async () => {
    const row = makeRow({
      metadata: '{"foo":"bar"}',
      sequence_number: 1,
      hash: 'h1',
      previous_hash: '',
    });
    mockQuery.mockResolvedValue({ rows: [row] });
    mockComputeRowHash.mockReturnValue('h1');

    await verifyAuditChain('tenant-1');
    const entry = mockComputeRowHash.mock.calls[0][4];
    expect(entry.metadata).toEqual({ foo: 'bar' });
  });

  it('handles null metadata as empty object', async () => {
    const row = makeRow({
      metadata: null,
      sequence_number: 1,
      hash: 'h1',
      previous_hash: '',
    });
    mockQuery.mockResolvedValue({ rows: [row] });
    mockComputeRowHash.mockReturnValue('h1');

    await verifyAuditChain('tenant-1');
    const entry = mockComputeRowHash.mock.calls[0][4];
    expect(entry.metadata).toEqual({});
  });

  it('tracks per-tenant sequence independently', async () => {
    const rows = [
      makeRow({ id: 'r1', tenant_id: 'A', sequence_number: 1, hash: 'ha1', previous_hash: '' }),
      makeRow({ id: 'r2', tenant_id: 'B', sequence_number: 1, hash: 'hb1', previous_hash: '' }),
      makeRow({ id: 'r3', tenant_id: 'A', sequence_number: 2, hash: 'ha2', previous_hash: 'ha1' }),
      makeRow({ id: 'r4', tenant_id: 'B', sequence_number: 2, hash: 'hb2', previous_hash: 'hb1' }),
    ];
    mockQuery.mockResolvedValue({ rows });
    mockComputeRowHash.mockReturnValueOnce('ha1').mockReturnValueOnce('hb1')
      .mockReturnValueOnce('ha2').mockReturnValueOnce('hb2');

    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: true });
  });

  it('returns valid: true when metadata is undefined string', async () => {
    const row = makeRow({
      metadata: undefined,
      sequence_number: 1,
      hash: 'h1',
      previous_hash: '',
    });
    mockQuery.mockResolvedValue({ rows: [row] });
    mockComputeRowHash.mockReturnValue('h1');

    const result = await verifyAuditChain('tenant-1');
    expect(result).toEqual({ valid: true });
  });
});

// ── getAuditTrailByTenant ────────────────────────────────────────────────────

describe('getAuditTrailByTenant', () => {
  it('throws TypeError on empty tenantId', async () => {
    await expect(getAuditTrailByTenant('')).rejects.toThrow(TypeError);
    await expect(getAuditTrailByTenant('')).rejects.toThrow('tenantId must be a non-empty string');
  });

  it('throws TypeError on non-string tenantId', async () => {
    await expect(getAuditTrailByTenant(null as unknown as string)).rejects.toThrow(TypeError);
    await expect(getAuditTrailByTenant(42 as unknown as string)).rejects.toThrow(TypeError);
  });

  it('clamps limit of 0 to 100 (falsy fallback)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrailByTenant('tenant-1', 0);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('clamps negative limit to 1', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrailByTenant('tenant-1', -10);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe(1);
  });

  it('clamps limit > 100 to 100', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrailByTenant('tenant-1', 500);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('defaults limit to 100 when NaN', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrailByTenant('tenant-1', NaN);
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('uses default limit of 100', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrailByTenant('tenant-1');
    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('maps rows inline to IAuditEntry shape', async () => {
    const row = makeRow();
    mockQuery.mockResolvedValue({ rows: [row] });
    const results = await getAuditTrailByTenant('tenant-1', 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'row-1',
      timestamp: '2026-01-01T00:00:00Z',
      actor: 'user-1',
      action: 'api_keys.create',
      resource: 'ApiKey:42',
      result: 'success',
      metadata: '{}',
      ipHash: 'abc123',
      tenantId: 'tenant-1',
    });
  });

  it('returns empty array when no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const results = await getAuditTrailByTenant('tenant-1');
    expect(results).toEqual([]);
  });

  it('defaults null metadata to empty object', async () => {
    const row = makeRow({ metadata: null });
    mockQuery.mockResolvedValue({ rows: [row] });
    const results = await getAuditTrailByTenant('tenant-1', 5);
    expect(results[0].metadata).toEqual({});
  });

  it('passes correct SQL with ORDER BY timestamp DESC and LIMIT', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await getAuditTrailByTenant('tenant-1', 25);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY "timestamp" DESC');
    expect(sql).toContain('LIMIT $2');
  });

  it('maps multiple rows correctly', async () => {
    const rows = [
      makeRow({ id: 'r1', result: 'success' }),
      makeRow({ id: 'r2', result: 'failure' }),
      makeRow({ id: 'r3', result: 'denied' }),
    ];
    mockQuery.mockResolvedValue({ rows });
    const results = await getAuditTrailByTenant('tenant-1', 10);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(results.map((r) => r.result)).toEqual(['success', 'failure', 'denied']);
  });

  it('preserves tenantId from row', async () => {
    const row = makeRow({ tenant_id: 'custom-tenant' });
    mockQuery.mockResolvedValue({ rows: [row] });
    const results = await getAuditTrailByTenant('custom-tenant', 5);
    expect(results[0].tenantId).toBe('custom-tenant');
  });
});
