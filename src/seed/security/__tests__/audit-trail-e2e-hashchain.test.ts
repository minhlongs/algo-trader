/**
 * E2E integration test: hash chain fields, request ID generation, and failure resilience.
 *
 * Verifies:
 * - Hash chain fields in INSERT (sequence_number, hash, previous_hash)
 * - Auto-generated requestId when x-request-id header is absent
 * - Non-blocking behavior when audit logging write fails
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

describe('Audit trail E2E — Hash chain and resilience', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp(auditMiddleware);
    mockQuery.mockImplementation(defaultMockQueryImpl);
  });

  it('includes hash chain fields in INSERT (sequence_number, hash, previous_hash)', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('MAX(sequence_number)')) return { rows: [{ next_seq: 5 }] };
      if (sql.includes('SELECT hash FROM audit_log')) return { rows: [{ hash: 'prev-hash-abc' }] };
      if (sql.includes('INSERT INTO audit_log')) return { rows: [] };
      return { rows: [] };
    });

    await request(app)
      .get('/api/test/success')
      .set('x-request-id', 'req-e2e-005');

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[9]).toBe(5);
    expect(typeof params[10]).toBe('string');
    expect(params[11]).toBe('prev-hash-abc');
  });

  it('generates requestId when x-request-id header is absent', async () => {
    const res = await request(app).get('/api/test/success');
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('does not block request when audit write fails', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('MAX(sequence_number)')) return { rows: [{ next_seq: 1 }] };
      if (sql.includes('SELECT hash FROM audit_log')) return { rows: [] };
      if (sql.includes('INSERT INTO audit_log')) throw new Error('DB connection lost');
      return { rows: [] };
    });

    const res = await request(app)
      .get('/api/test/success')
      .set('x-request-id', 'req-e2e-007');

    expect(res.status).toBe(200);
  });
});
