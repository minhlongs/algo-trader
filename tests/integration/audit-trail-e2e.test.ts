/**
 * End-to-end integration test for the unified audit trail & rate limiter pipeline.
 *
 * Verifies:
 * 1. POST/DELETE mutations generate structured audit rows.
 * 2. Audit entries contain required fields (actor, action, result, ipHash).
 * 3. Audit trail query by tenant returns persisted entries.
 * 4. Hash chain immutability linking consecutive entries.
 * 5. Rate limiting denial logs audit entries with result='denied'.
 * 6. Zod schema validation enforces entry contracts and rejects malformed entries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import { ZodError } from 'zod';
import type { TenantId } from '../../src/shared/tenant';

process.env.AUDIT_HMAC_KEY_v1 = 'f'.repeat(64);
process.env.ADMIN_API_KEY = 'test-admin-key-audit-e2e';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../src/db/postgres-client', () => ({
  query: mockQuery,
}));

vi.mock('../../src/redis/index', () => ({
  getRedisClient: vi.fn(() => ({
    pipeline: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    zcard: vi.fn().mockResolvedValue(0),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  })),
}));

import { auditMiddleware } from '../../src/seed/security/audit-middleware';
import { rateLimitMiddleware } from '../../src/forest/rate-limit/redis-rate-limiter';
import { emitRateLimitAuditEvent } from '../../src/forest/rate-limit/audit-hook';
import { getAuditTrail } from '../../src/seed/security/audit-trail-queries';
import { computeRowHash } from '../../src/seed/security/audit-hash-chain';
import { validateAuditEntryWithZod } from '../../src/seed/security/schemas/audit-entry-schema';
import type { IAuditEntry } from '../../src/seed/security/types';

function createE2eApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { user?: { tenantId?: string } }).user = { tenantId: 'tenant-prod-a' };
    next();
  });
  app.use(auditMiddleware);
  app.use('/api/limited', rateLimitMiddleware({ allowAnonymous: true }));

  app.post('/api/orders', (req: Request, res: Response) => {
    res.status(201).json({ orderId: 'ord-101', status: 'created', body: req.body });
  });

  app.delete('/api/orders/:id', (req: Request, res: Response) => {
    res.status(200).json({ orderId: req.params.id, status: 'cancelled' });
  });

  return app;
}

describe('Audit Trail E2E Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], command: 'SELECT' };
      if (sql.includes('MAX(sequence_number)')) return { rows: [{ next_seq: 1 }], command: 'SELECT' };
      if (sql.includes('SELECT hash FROM audit_log')) return { rows: [], command: 'SELECT' };
      if (sql.includes('INSERT INTO audit_log')) return { rows: [], command: 'INSERT' };
      return { rows: [], command: 'SELECT' };
    });
    app = createE2eApp();
  });

  it('creates audit entry for POST mutation with correct fields', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('x-request-id', 'req-post-001')
      .send({ symbol: 'BTC-USDC', size: 1.5 });

    expect(res.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe('req-post-001');
    expect(params[2]).toBe('req-post-001');
    expect(params[3]).toBe('post.api.orders');
    expect(params[5]).toBe('success');
    expect(params[7]).toMatch(/^[0-9a-f]{64}$/);
    expect(params[8]).toBe('tenant-prod-a');
  });

  it('creates audit entry for DELETE mutation', async () => {
    const res = await request(app)
      .delete('/api/orders/ord-999')
      .set('x-request-id', 'req-del-002');

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe('req-del-002');
    expect(params[3]).toBe('delete.api.orders.ord-999');
    expect(params[5]).toBe('success');
  });

  it('audit entry is queryable by tenant scope', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'row-001',
          timestamp: new Date().toISOString(),
          actor: 'usr-analyst-1',
          action: 'post.api.orders',
          resource: 'API',
          result: 'success',
          metadata: { orderId: 'ord-101' },
          ip_hash: 'a'.repeat(64),
          tenant_id: 'tenant-prod-a',
          sequence_number: 1,
          hash: 'b'.repeat(64),
          previous_hash: null,
        },
      ],
    });

    const entries = await getAuditTrail('API', 10, 'tenant-prod-a');
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toBe('usr-analyst-1');
    expect(entries[0].tenantId).toBe('tenant-prod-a');
    expect(entries[0].result).toBe('success');
  });

  it('verifies hash chain links entries sequentially', () => {
    const key = Buffer.from('a'.repeat(64), 'hex');
    const entry1: IAuditEntry = {
      id: 'e1',
      timestamp: '2026-09-25T10:00:00.000Z',
      actor: 'system',
      action: 'keys.rotate',
      resource: 'KeyVault',
      result: 'success',
      metadata: {},
      ipHash: '0'.repeat(64),
      tenantId: 'tenant-prod-a',
    };

    const hash1 = computeRowHash(key, 'tenant-prod-a', 1, '', entry1);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    const entry2: IAuditEntry = {
      id: 'e2',
      timestamp: '2026-09-25T10:00:05.000Z',
      actor: 'usr-analyst-1',
      action: 'orders.cancel',
      resource: 'Order:101',
      result: 'success',
      metadata: {},
      ipHash: '0'.repeat(64),
      tenantId: 'tenant-prod-a',
    };

    const hash2 = computeRowHash(key, 'tenant-prod-a', 2, hash1, entry2);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).not.toBe(hash1);
  });

  it('logs audit entry with result=denied when rate limit is exceeded', async () => {
    await emitRateLimitAuditEvent({
      tenantId: 'tenant-prod-a' as TenantId,
      tier: 'FREE',
      endpoint: '/api/orders',
      remainingMs: 0,
      retryAfter: 60,
    });

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[2]).toBe('tenant-prod-a');
    expect(params[3]).toBe('rate_limit.exceeded');
    expect(params[4]).toBe('RateLimit');
    expect(params[5]).toBe('denied');
    expect(params[8]).toBe('tenant-prod-a');
  });

  it('rejects malformed audit entry via Zod validation schema', () => {
    const invalidEntry = {
      id: '',
      timestamp: 'not-a-valid-iso-date',
      actor: '',
      action: 'orders.submit',
      resource: 'Orderbook',
      result: 'invalid-result-type',
      metadata: { big: 'x'.repeat(5000) },
      ipHash: 'not-hex',
    };

    expect(() => validateAuditEntryWithZod(invalidEntry)).toThrowError(ZodError);
  });
});
