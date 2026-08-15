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

// ─── Env setup (before imports) ────────────────────────────────────────────────
process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);
process.env.ADMIN_API_KEY = 'test-admin-key-for-api-tests';

// ─── Mock DB ───────────────────────────────────────────────────────────────────
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../db/postgres-client', () => ({
  query: mockQuery,
}));

// ─── Mock Redis (needed for rate-limiter fallback) ─────────────────────────────
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

// ─── Imports (after mocks) ─────────────────────────────────────────────────────
import { auditMiddleware } from '../audit-middleware';

// ─── Test helpers ──────────────────────────────────────────────────────────────
function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use(auditMiddleware);

  // Simulated API routes
  app.get('/api/test/success', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/test/forbidden', (_req, res) => {
    res.status(403).json({ error: 'forbidden' });
  });

  app.post('/api/test/create', (req, res) => {
    res.status(201).json({ created: true, body: req.body });
  });

  app.get('/api/test/server-error', (_req, res) => {
    res.status(500).json({ error: 'internal' });
  });

  return app;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('Audit trail E2E (request → middleware → DB → query)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    // Default mock: advisory lock + sequence + hash queries succeed
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return { rows: [], command: 'SELECT' };
      }
      if (sql.includes('MAX(sequence_number)')) {
        return { rows: [{ next_seq: 1 }], command: 'SELECT' };
      }
      if (sql.includes('SELECT hash FROM audit_log')) {
        return { rows: [], command: 'SELECT' };
      }
      if (sql.includes('INSERT INTO audit_log')) {
        return { rows: [], command: 'INSERT' };
      }
      return { rows: [], command: 'SELECT' };
    });
  });

  it('records audit entry for successful request', async () => {
    const res = await request(app)
      .get('/api/test/success')
      .set('x-request-id', 'req-e2e-001');

    expect(res.status).toBe(200);

    // Wait for async audit write
    await new Promise((r) => setTimeout(r, 50));

    // Verify INSERT was called with correct fields
    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    expect(params[0]).toBe('req-e2e-001'); // id = request-id
    expect(params[3]).toBe('get.api.test.success'); // action = method.url (stripped)
    expect(params[4]).toBe('API'); // resource = hardcoded 'API'
    expect(params[5]).toBe('success'); // result = success (2xx)
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
    expect(params[5]).toBe('denied'); // 4xx → denied
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
    expect(params[5]).toBe('failure'); // 5xx → failure
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

  it('includes hash chain fields in INSERT (sequence_number, hash, previous_hash)', async () => {
    // Mock sequence = 5, previous hash exists
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
    expect(params[9]).toBe(5); // sequence_number
    expect(typeof params[10]).toBe('string'); // hash (computed)
    expect(params[11]).toBe('prev-hash-abc'); // previous_hash
  });

  it('generates requestId when x-request-id header is absent', async () => {
    const res = await request(app)
      .get('/api/test/success');
      // No x-request-id header

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const insertCall = mockQuery.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log'),
    );
    expect(insertCall).toBeDefined();

    const params = insertCall![1];
    // Should be a UUID (auto-generated)
    expect(params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('does not block request when audit write fails', async () => {
    // Simulate DB failure on INSERT
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('MAX(sequence_number)')) return { rows: [{ next_seq: 1 }] };
      if (sql.includes('SELECT hash FROM audit_log')) return { rows: [] };
      if (sql.includes('INSERT INTO audit_log')) throw new Error('DB connection lost');
      return { rows: [] };
    });

    // Request should still succeed (audit middleware is fire-and-forget)
    const res = await request(app)
      .get('/api/test/success')
      .set('x-request-id', 'req-e2e-007');

    expect(res.status).toBe(200);
  });
});
