/**
 * E2E integration test: request → audit middleware → DB → query roundtrip.
 *
 * Verifies the full audit trail pipeline:
 * 1. HTTP request hits Express app with auditMiddleware wired
 * 2. auditMiddleware calls logAudit which writes to DB (mocked)
 * 3. Querying the audit log returns the recorded entry
 *
 * No live PostgreSQL required — all DB calls mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);
process.env.ADMIN_API_KEY = 'test-admin-key-for-api-tests';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../db/postgres-client', () => ({
  query: mockQuery,
}));

vi.mock('../../../redis/index', () => ({
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

import { auditMiddleware } from '../audit-middleware';
import { buildApp, defaultMockQueryImpl } from './audit-trail-fixtures.js';

describe('Audit trail E2E (request → middleware → DB → query)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp(auditMiddleware);
    mockQuery.mockImplementation(defaultMockQueryImpl);
  });

  it('records audit entry for successful request', async () => {
    const res = await request(app)
      .get('/api/test/success')
      .set('x-request-id', 'req-e2e-001');

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[0]).toBe('req-e2e-001');
    expect(params[3]).toBe('get.api.test.success');
    expect(params[4]).toBe('API');
    expect(params[5]).toBe('success');
  });

  it('records audit entry for forbidden request (4xx = denied)', async () => {
    const res = await request(app)
      .get('/api/test/forbidden')
      .set('x-request-id', 'req-e2e-002');

    expect(res.status).toBe(403);

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[0]).toBe('req-e2e-002');
    expect(params[5]).toBe('denied');
  });

  it('records audit entry for server error (5xx = failure)', async () => {
    const res = await request(app)
      .get('/api/test/server-error')
      .set('x-request-id', 'req-e2e-003');

    expect(res.status).toBe(500);

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[5]).toBe('failure');
  });

  it('records audit entry for POST request with body', async () => {
    const res = await request(app)
      .post('/api/test/create')
      .set('x-request-id', 'req-e2e-004')
      .send({ name: 'test-item' });

    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[0]).toBe('req-e2e-004');
    expect(params[5]).toBe('success');
  });
});
