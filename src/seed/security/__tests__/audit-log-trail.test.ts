/**
 * Test suite for src/seed/security/audit-log — trail read path.
 *
 * Self-contained sub-suite covering getAuditTrail + getAuditTrailByTenant.
 */

import crypto from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../db/postgres-client', () => ({
  query: vi.fn(),
}));

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64); // 64 hex chars = 32 bytes

import { query } from '../../../db/postgres-client';
import {
  getAuditTrail,
  getAuditTrailByTenant,
  hashIpAddress,
} from '../audit-log';

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

describe('getAuditTrail', () => {
  const mockRows = [
    { id: '1', timestamp: '2026-01-01T00:00:00Z', actor: 'u1', action: 'a', resource: 'R', result: 'success', metadata: {}, ip_hash: 'h1' },
    { id: '2', timestamp: '2026-01-02T00:00:00Z', actor: 'u2', action: 'b', resource: 'R', result: 'failure', metadata: {}, ip_hash: 'h2' },
  ];

  it('calls query with resource and limit', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    await getAuditTrail('R', 5);
    const [sql, params] = (query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('WHERE resource');
    expect(params[0]).toBe('R');
    expect(params[1]).toBe(5);
  });

  it('defaults limit to 100', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    await getAuditTrail('R');
    const [, params] = (query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('clamps limit to 100 ceiling', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    await getAuditTrail('R', 9999);
    const [, params] = (query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('maps rows to IAuditEntry objects', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    const results = await getAuditTrail('R', 10);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[1].result).toBe('failure');
  });

  it('returns empty array when no rows match', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    const results = await getAuditTrail('__nonexistent__');
    expect(results).toEqual([]);
  });

  it('throws on non-string or empty resource', async () => {
    await expect(getAuditTrail(null as unknown as string)).rejects.toThrow();
    await expect(getAuditTrail('')).rejects.toThrow();
  });
});

describe('getAuditTrailByTenant', () => {
  const mockRows = [
    { id: '1', timestamp: '2026-01-01T00:00:00Z', actor: 'u1', action: 'a', resource: 'R', result: 'success', metadata: {}, ip_hash: 'h1', tenant_id: 'tenant-1', sequence_number: 1, hash: 'h1', previous_hash: '' },
    { id: '2', timestamp: '2026-01-02T00:00:00Z', actor: 'u2', action: 'b', resource: 'R', result: 'failure', metadata: {}, ip_hash: 'h2', tenant_id: 'tenant-1', sequence_number: 2, hash: 'h2', previous_hash: 'h1' },
  ];

  it('calls query with tenant_id and limit', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    await getAuditTrailByTenant('tenant-1', 5);
    const [sql, params] = (query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('WHERE tenant_id');
    expect(params[0]).toBe('tenant-1');
    expect(params[1]).toBe(5);
  });

  it('defaults limit to 100', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    await getAuditTrailByTenant('tenant-1');
    const [, params] = (query as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(params[1]).toBe(100);
  });

  it('maps rows to IAuditEntry objects', async () => {
    (query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockRows });
    const results = await getAuditTrailByTenant('tenant-1', 10);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[1].result).toBe('failure');
  });

  it('throws on non-string or empty tenantId', async () => {
    await expect(getAuditTrailByTenant(null as unknown as string)).rejects.toThrow();
    await expect(getAuditTrailByTenant('')).rejects.toThrow();
  });
});
