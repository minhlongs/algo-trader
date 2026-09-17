/**
 * Test suite for src/seed/security/audit-log — auditMiddleware.
 *
 * Self-contained sub-suite. Re-declares the pg mock, env, helpers,
 * and beforeEach so it can run independently of audit-log.test.ts.
 */

import crypto from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64); // 64 hex chars = 32 bytes

import { query } from '../../../db/postgres-client';
import {
  auditMiddleware,
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
