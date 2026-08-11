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
  auditMiddleware,
  getAuditTrail,
  getAuditTrailByTenant,
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
// getAuditTrail
// ===================================================================

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

// ===================================================================
// getAuditTrailByTenant
// ===================================================================

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

// ===================================================================
// auditMiddleware
// ===================================================================

describe('auditMiddleware', () => {
  /** Mutable test double for Express `res` */
  function buildRes() {
    const locals: Record<string, unknown> = {};
    const jsonCalls: unknown[] = [];
    let lastStatus = 200;

    const statusChain = {
      json(body: unknown): void {
        jsonCalls.push(body);
        return statusChain;
      },
    };

    return {
      locals,
      jsonCalls,
      lastStatus: () => lastStatus,
      res: {
        locals,
        status(c: number) {
          lastStatus = c;
          return statusChain;
        },
        json(body: unknown) {
          jsonCalls.push(body);
        },
      } as unknown as Parameters<typeof auditMiddleware>[1],
    };
  }

  it('generates a UUID requestId and calls next() when x-request-id is absent', async () => {
    const mock = buildRes();
    const req = {
      method: 'GET',
      url: '/api/test',
      headers: {},
    };
    const next = vi.fn();

    await auditMiddleware(req, mock.res, next);

    // Fallback must never block or reject the request.
    expect(mock.locals.requestId).toBeDefined();
    expect(mock.locals.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('attaches requestId and calls next() when header present', async () => {
    const mock = buildRes();
    const req = {
      method: 'POST',
      url: '/api/strategies',
      headers: { 'x-request-id': 'req-abc' },
    };
    const next = vi.fn();

    await auditMiddleware(req, mock.res, next);

    expect(mock.locals.requestId).toBe('req-abc');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fires logAudit when downstream handler calls res.status().json()', async () => {
    const mock = buildRes();
    const req = {
      method: 'POST',
      url: '/api/strategies',
      headers: {
        'x-request-id': 'req-456',
        'x-forwarded-for': '198.51.100.42',
      },
    };
    const next = vi.fn();

    await auditMiddleware(req, mock.res, next);

    // Simulate handler: res.status(201).json({ ok: true })
    mock.res.status(201).json({ ok: true, id: 'strat-99' });

    // Wait for fire-and-forget promise
    await new Promise((r) => setTimeout(r, 30));

    expect(query).toHaveBeenCalled();
    const insert = (query as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insert).toBeDefined();
  });

  it('uses denied result for 4xx responses', async () => {
    const mock = buildRes();
    const req = {
      method: 'GET',
      url: '/api/secret',
      headers: { 'x-request-id': 'req-deny' },
    };
    const next = vi.fn();

    await auditMiddleware(req, mock.res, next);
    mock.res.status(403).json({ error: 'forbidden' });

    await new Promise((r) => setTimeout(r, 30));

    const insert = (query as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insert).toBeDefined();
    const params = insert![1];
    expect(params[5]).toBe('denied'); // result field
  });
});