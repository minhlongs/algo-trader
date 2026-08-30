/**
 * Tests for audit-routes — /api/v1/audit/logs, /export, /license/:id/audit.
 *
 * Mocks postgres-client (query + getDbClient) and downstream services so the
 * route handlers can be exercised end-to-end with supertest — no live DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// ── Mock factories (hoisted) ───────────────────────────────────────────────────

const { mockQuery, mockConnect, mockRelease, mockQueryStreamCtor, mockGetDbClient } = vi.hoisted(() => {
  const connect = vi.fn();
  const release = vi.fn();
  return {
    mockQuery: vi.fn(),
    mockConnect: connect,
    mockRelease: release,
    mockQueryStreamCtor: vi.fn(),
    mockGetDbClient: vi.fn(() => ({
      connect,
      release,
    })),
  };
});

vi.mock('../../../db/postgres-client.js', () => {
  console.log('[MOCK SETUP] postgres-client mock being set up');
  return {
    query: mockQuery,
    getDbClient: (...args: unknown[]) => {
      console.log('[MOCK GETDBCLIENT] Called with:', args);
      const result = mockGetDbClient(...args);
      console.log('[MOCK GETDBCLIENT] Returns:', Object.keys(result));
      return result;
    },
  };
});

vi.mock('pg-query-stream', () => ({
  default: vi.fn().mockImplementation(function (sql: string, params: unknown[]) {
    mockQueryStreamCtor(sql, params);
    return {};
  }),
}));

const mockGetLogsByLicense = vi.fn();
const mockGetLicense = vi.fn();

vi.mock('@platform/audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      getLogsByLicense: (...args: unknown[]) => mockGetLogsByLicense(...args),
    }),
  },
}));

vi.mock('@platform/billing/license-service', () => ({
  LicenseService: {
    getInstance: () => ({
      getLicense: (...args: unknown[]) => mockGetLicense(...args),
    }),
  },
}));

vi.mock('@platform/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// ── Import after hoisted mocks ────────────────────────────────────────────────

import { auditRouter } from '../audit-routes';

// Debug: add logging to the actual route
console.log('[TEST SETUP] auditRouter imported, routes:', auditRouter.stack?.map((r: any) => r.route?.path).filter(Boolean));

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Stream handler registry — route registers on('data'/'end'/'error'), tests fire them. */
const streamHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
let currentStreamMock: NodeJS.ReadWriteStream | null = null;
let streamReadyResolve: (() => void) | null = null;

/** Promise that resolves when all 3 stream handlers are registered. */
function streamReady(): Promise<void> {
  if (streamHandlers.data && streamHandlers.end && streamHandlers.error) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    streamReadyResolve = resolve;
  });
}

/** Helper to send request and wait for stream handlers to register. */
async function sendAndWaitForStream(
  app: express.Express,
  path: string,
  claims?: { sub?: string; role?: string }
): Promise<{ streamPromise: Promise<request.Response>; fireData: (row: unknown) => void; fireEnd: () => void; fireError: (err: Error) => void }> {
  const testAgent = request(app);
  const streamPromise = testAgent.get(path).then((res) => res);

  // Give route handler time to execute and register stream handlers
  await new Promise(resolve => setTimeout(resolve, 200));

  // Wait for handlers to register with timeout
  await Promise.race([
    streamReady(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('streamReady timeout')), 3000))
  ]);

  return {
    streamPromise,
    fireData: (row: unknown) => fireStream('data', row),
    fireEnd: () => fireStream('end'),
    fireError: (err: Error) => fireStream('error', err),
  };
}

function makeStreamMock(): NodeJS.ReadWriteStream {
  const mock = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      console.log('[MOCK STREAM ON] event:', event);
      (streamHandlers[event] ??= []).push(handler);
      // Resolve when all handlers needed for the test are registered
      // For successful streams: data + end; for error streams: error
      if ((streamHandlers.data && streamHandlers.end) || streamHandlers.error) {
        if (streamReadyResolve) {
          streamReadyResolve();
          streamReadyResolve = null;
        }
      }
      return mock;
    }),
  } as unknown as NodeJS.ReadWriteStream;
  return mock;
}

function setupExportStream() {
  currentStreamMock = makeStreamMock();
  // Use hoisted mock functions directly so tests can assert on them
  mockConnect.mockImplementation(() => {
    console.log('[FRESH CONNECT] Called');
    return mockClient;
  });
  mockRelease.mockImplementation(() => {
    console.log('[FRESH RELEASE] Called');
  });
  const mockClient = {
    query: vi.fn().mockImplementation((qs) => {
      console.log('[MOCK CLIENT QUERY] Called with QueryStream:', !!qs, 'qs.constructor:', qs?.constructor?.name);
      return currentStreamMock;
    }),
    release: mockRelease,
  };
  mockConnect.mockReturnValue(mockClient);
  mockGetDbClient.mockReturnValue({ connect: mockConnect, release: mockRelease });
  console.log('[setupExportStream] mockGetDbClient return value set to:', { connect: typeof mockConnect, release: typeof mockRelease });
  mockQueryStreamCtor.mockImplementation((sql, params) => {
    console.log('[MOCK QUERYSTREAM CTOR] Called with:', sql?.substring(0, 50), params);
    return {};
  });
  console.log('[setupExportStream] mocks configured');
}

function fireStream(event: string, ...args: unknown[]) {
  streamHandlers[event]?.forEach((h) => h(...args));
}

function buildApp(claims?: { sub?: string; role?: string }): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/audit', (req: Request, _res: Response, next: NextFunction) => {
    console.log('[BUILDAPP MIDDLEWARE] Path:', req.path, 'Claims:', claims);
    if (claims) {
      (req as Request & { claims: unknown }).claims = claims;
    }
    next();
  });
  app.use('/api/v1/audit', (req, res, next) => {
    console.log('[BUILDAPP AUDIT ROUTER] Path:', req.path);
    next();
  });
  app.use('/api/v1/audit', auditRouter);
  return app;
}

// Admin WITH sub claim - gets tenant-scoped to their sub
const ADMIN_CLAIMS = { sub: 'admin-user', role: 'admin' };
// User with sub
const USER_CLAIMS = { sub: 'user-1', role: 'user' };
// Admin WITHOUT sub - true admin-wide (no tenant scoping)
const ADMIN_NO_SUB_CLAIMS = { role: 'admin' };

const DB_ROWS = [
  {
    id: 'log-1',
    tenant_id: 'tenant-a',
    sequence_number: '100',
    event_type: 'created',
    action_by: 'admin-user',
    reason: 'test event',
    metadata: '{"key":"value"}',
    hash: 'abc123',
    previous_hash: null,
    created_at: '2026-08-30T10:00:00Z',
  },
  {
    id: 'log-2',
    tenant_id: 'tenant-a',
    sequence_number: '101',
    event_type: 'updated',
    action_by: 'admin-user',
    reason: 'update event',
    metadata: null,
    hash: 'def456',
    previous_hash: 'abc123',
    created_at: '2026-08-30T10:01:00Z',
  },
];

// ── GET /logs ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/audit/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(streamHandlers).forEach((k) => delete streamHandlers[k]);
  });

  it('returns 400 for invalid query params (bad limit)', async () => {
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs?limit=2000');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for invalid datetime', async () => {
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs?startDate=not-a-date');
    expect(res.status).toBe(400);
  });

  it('returns 403 when non-admin has no subscriber identity in token', async () => {
    const res = await request(buildApp({ role: 'user' })).get('/api/v1/audit/logs');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('no subscriber identity');
  });

  it('returns 403 when non-admin attempts cross-tenant access', async () => {
    const res = await request(buildApp(USER_CLAIMS)).get('/api/v1/audit/logs?tenantId=other-tenant');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('cross-tenant access denied');
  });

  it('returns parsed logs for admin with tenant filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: DB_ROWS });
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs?tenantId=tenant-a');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    // metadata string is JSON-parsed
    expect(res.body.logs[0].metadata).toEqual({ key: 'value' });
    // sequence_number string is int-parsed
    expect(res.body.logs[0].sequence_number).toBe(100);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('ORDER BY sequence_number DESC');
    expect(params).toContain('tenant-a');
  });

  it('returns logs for non-admin scoped to their own tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DB_ROWS[0]] });
    const res = await request(buildApp(USER_CLAIMS)).get('/api/v1/audit/logs');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    // targetTenantId defaults to token sub
    const [, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toContain('user-1');
  });

  it('applies eventType and date filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp(ADMIN_CLAIMS)).get(
      '/api/v1/audit/logs?eventType=created&startDate=2026-08-01T00:00:00Z&endDate=2026-08-31T00:00:00Z'
    );

    expect(res.status).toBe(200);
    const [sql] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('event_type = $');
    expect(sql).toContain('created_at >= $');
    expect(sql).toContain('created_at <= $');
  });

  it('uses sequence-number keyset pagination for tenant-scoped queries', async () => {
    mockQuery.mockResolvedValueOnce({ rows: DB_ROWS });
    const res = await request(buildApp(ADMIN_CLAIMS)).get(
      '/api/v1/audit/logs?tenantId=tenant-a&cursorSeq=99'
    );

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('sequence_number < $');
    expect(params).toContain(99);
  });

  it('uses created+id cursor pagination for admin-wide queries (no sub claim)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: DB_ROWS });
    const res = await request(buildApp(ADMIN_NO_SUB_CLAIMS)).get(
      '/api/v1/audit/logs?cursorCreated=2026-08-30T10:00:00Z&cursorId=123e4567-e89b-12d3-a456-426614174000'
    );

    expect(res.status).toBe(200);
    const [sql] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('(created_at, id) <');
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
  });

  it('returns cursorSeq as nextCursor for tenant-scoped full pages', async () => {
    const manyRows = Array.from({ length: 100 }, (_, i) => ({
      ...DB_ROWS[0],
      sequence_number: String(100 + i), // unique sequence numbers
      id: `log-${i}`,
    }));
    mockQuery.mockResolvedValueOnce({ rows: manyRows });
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs?tenantId=tenant-a');

    expect(res.status).toBe(200);
    // Last row has sequence_number 199
    expect(res.body.nextCursor).toEqual({ cursorSeq: 199 });
  });

  it('returns created+id as nextCursor for admin-wide full pages (no sub claim)', async () => {
    const manyRows = Array.from({ length: 100 }, (_, i) => ({
      ...DB_ROWS[0],
      sequence_number: String(100 + i),
      id: `log-${i}`,
      created_at: new Date(Date.now() + i * 1000).toISOString(),
    }));
    mockQuery.mockResolvedValueOnce({ rows: manyRows });
    const res = await request(buildApp(ADMIN_NO_SUB_CLAIMS)).get('/api/v1/audit/logs');

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toHaveProperty('cursorCreated');
    expect(res.body.nextCursor).toHaveProperty('cursorId');
  });

  it('returns null nextCursor when fewer rows than limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DB_ROWS[0]] });
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs?tenantId=tenant-a&limit=100');

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
  });

  it('returns 500 when DB query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('DB connection lost');
  });
});

// ── GET /logs/:id ─────────────────────────────────────────────────────────────

describe('GET /api/v1/audit/logs/:id', () => {
  it('returns 501 Not Implemented', async () => {
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/logs/any-id');
    expect(res.status).toBe(501);
    expect(res.body.message).toContain('not implemented');
  });
});

// ── GET /export ───────────────────────────────────────────────────────────────

describe('GET /api/v1/audit/export', () => {
  beforeEach(() => {
    // Reset only mocks that need clearing between tests - avoid vi.clearAllMocks()
    // which would clear mockGetDbClient/mockQueryStreamCtor implementations set by setupExportStream()
    mockQuery.mockReset();
    mockGetLogsByLicense.mockReset();
    mockGetLicense.mockReset();
    Object.keys(streamHandlers).forEach((k) => delete streamHandlers[k]);
    currentStreamMock = null;
    streamReadyResolve = null;
  });

  it('returns 400 for invalid format', async () => {
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/export?format=xml');
    expect(res.status).toBe(400);
  });

  it('returns 403 when non-admin has no subscriber identity', async () => {
    const res = await request(buildApp({ role: 'user' })).get('/api/v1/audit/export');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('no subscriber identity');
  });

  it('returns 403 when non-admin attempts cross-tenant export', async () => {
    const res = await request(buildApp(USER_CLAIMS)).get('/api/v1/audit/export?tenantId=other');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('cross-tenant access denied');
  });

  it('streams CSV with header row, escaped fields, and releases client', async () => {
    setupExportStream();

    const { streamPromise, fireData, fireEnd } = await sendAndWaitForStream(
      buildApp(ADMIN_CLAIMS),
      '/api/v1/audit/export?format=csv'
    );

    // Now fire stream events
    fireData(DB_ROWS[0]);
    fireEnd();

    // Wait for response
    const res = await streamPromise;
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv');
    expect(res.headers['content-disposition']).toContain('audit-logs-');
    expect(res.text).toContain('id,tenant_id,sequence_number,event_type');
    // row data present with int-parsed sequence
    expect(res.text).toContain(',100,');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    // QueryStream constructed with the built SQL + tenant param
    expect(mockQueryStreamCtor).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQueryStreamCtor.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('FROM tenant_audit_logs');
    expect(params).toEqual(['admin-user']);
  });

  it('escapes CSV fields containing special characters', async () => {
    setupExportStream();

    const { streamPromise, fireData, fireEnd } = await sendAndWaitForStream(
      buildApp(ADMIN_CLAIMS),
      '/api/v1/audit/export?format=csv'
    );

    fireData({
      ...DB_ROWS[0],
      reason: 'has,comma and "quote"',
      metadata: 'a\nb',
    });
    fireEnd();

    const res = await streamPromise;
    expect(res.status).toBe(200);
    // comma/quote/newline fields are wrapped in quotes with doubled quotes
    expect(res.text).toContain('"has,comma and ""quote"""');
    expect(res.text).toContain('"a\nb"');
  });

  it('streams JSON array and releases client', async () => {
    setupExportStream();

    const { streamPromise, fireData, fireEnd } = await sendAndWaitForStream(
      buildApp(ADMIN_CLAIMS),
      '/api/v1/audit/export?format=json'
    );

    fireData(DB_ROWS[0]);
    fireData(DB_ROWS[1]);
    fireEnd();

    const res = await streamPromise;
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json');
    // two rows joined with comma, wrapped in brackets, metadata parsed
    expect(res.text).toContain('"key":"value"');
    expect(res.text.startsWith('[')).toBe(true);
    expect(res.text.endsWith(']')).toBe(true);
    const json = JSON.parse(res.text);
    expect(json).toHaveLength(2);
    expect(json[0].sequence_number).toBe(100);
    // release called at least once when stream ends
    expect(mockRelease).toHaveBeenCalled();
  });

  it('invokes error handler and releases client on stream error', async () => {
    setupExportStream();

    const { streamPromise, fireError, fireEnd } = await sendAndWaitForStream(
      buildApp(ADMIN_CLAIMS),
      '/api/v1/audit/export?format=json'
    );

    // Route writes '[' for JSON before any stream event, so headers are already
    // sent by the time the error fires - the error handler cannot send 500 and
    // does not call res.end(). Fire error to exercise the handler, then fire end
    // to resolve the response so the test completes.
    fireError(new Error('Stream failure'));
    fireEnd();

    const res = await streamPromise;
    // Error handler ran and released the client
    expect(mockRelease).toHaveBeenCalled();
    // Response was started (JSON bracket written) - status stays 200
    expect(res.status).toBe(200);
  });
});

// ── GET /license/:id/audit ────────────────────────────────────────────────────

describe('GET /api/v1/audit/license/:id/audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when license not found', async () => {
    mockGetLicense.mockReturnValueOnce(undefined);
    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/license/missing-lic/audit');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('returns audit logs for a valid license', async () => {
    mockGetLicense.mockReturnValueOnce({ id: 'lic-1', key: 'key-1' });
    const auditLogs = [{ id: 'log-1', event_type: 'license_created' }];
    mockGetLogsByLicense.mockResolvedValueOnce(auditLogs);

    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/license/lic-1/audit');

    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual(auditLogs);
    expect(mockGetLogsByLicense).toHaveBeenCalledWith('lic-1');
  });

  it('returns empty logs array for license with no audit history', async () => {
    mockGetLicense.mockReturnValueOnce({ id: 'lic-abc', key: 'key-xyz' });
    mockGetLogsByLicense.mockResolvedValueOnce([]);

    const res = await request(buildApp(ADMIN_CLAIMS)).get('/api/v1/audit/license/lic-abc/audit');

    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual([]);
  });
});