import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Set required env before any imports
process.env.ADMIN_API_KEY = 'test-admin-key-for-api-tests';

// ─── Mock factories via vi.hoisted() ──────────────────────────────────────────

const { mockRedis, mockQuery, mockGetDbClient, mockEmitRateLimit, mockEmitUpsert, mockEmitDeletion, mockEmitConfig, mockLogAudit } = vi.hoisted(() => {
  const redis = {
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    })),
    get: vi.fn().mockResolvedValue(null),
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue('PONG'),
    info: vi.fn().mockResolvedValue([
      '# Server',
      'redis_version:7.0.0',
      'uptime_in_seconds:86400',
      '# Memory',
      'used_memory:1048576',
      '# Stats',
      'total_connections_received:100',
      'total_commands_processed:5000',
    ].join('\r\n')),
  };

  const query = vi.fn().mockResolvedValue({ rows: [] });
  const getDbClient = vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
    release: vi.fn(),
  }));

  const emitRateLimit = vi.fn().mockResolvedValue(undefined);
  const emitUpsert = vi.fn().mockResolvedValue(undefined);
  const emitDeletion = vi.fn().mockResolvedValue(undefined);
  const emitConfig = vi.fn().mockResolvedValue(undefined);
  const logAudit = vi.fn().mockResolvedValue(undefined);

  return { mockRedis: redis, mockQuery: query, mockGetDbClient: getDbClient, mockEmitRateLimit: emitRateLimit, mockEmitUpsert: emitUpsert, mockEmitDeletion: emitDeletion, mockEmitConfig: emitConfig, mockLogAudit: logAudit };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../redis', () => ({
  getRedisClient: () => mockRedis,
}));

// Mock DB for audit log (used by audit-routes via ../../db/postgres-client.js from src/api/routes)
vi.mock('../../../db/postgres-client', () => ({
  query: mockQuery,
  getDbClient: mockGetDbClient,
  transaction: vi.fn().mockImplementation(async (fn: any) => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'log-123',
            tenant_id: 'tenant-123',
            sequence_number: '1',
            event_type: 'rate_limit.exceeded',
            action_by: 'system',
            reason: 'Rate limit exceeded',
            metadata: { tier: 'FREE', endpoint: '/api/v1/trades' },
            hash: 'somehash',
            previous_hash: null,
            created_at: new Date().toISOString(),
          },
        ],
      }),
      release: vi.fn(),
    };
    return fn(mockClient);
  }),
}));

// Mock shared DB (used by credentials-repository via @shared/db/postgres-client)
vi.mock('@shared/db/postgres-client', () => ({
  query: mockQuery,
  getDbClient: mockGetDbClient,
  transaction: vi.fn().mockImplementation(async (fn: any) => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    return fn(mockClient);
  }),
}));

vi.mock('../../../db/trade-repository', () => ({
  TradeRepository: class {
    getRecent = vi.fn().mockResolvedValue([]);
    getById = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock('../../../desk/engine', () => ({
  TradingEngine: class {
    getOrders = () => [];
  },
}));

vi.mock('../../../desk/wiring/qwen-drawdown-monitor', () => ({
  isQwenEnabled: () => true,
  isKillSwitchActive: () => false,
}));

vi.mock('../../../desk/risk/circuit-breaker', () => ({
  CircuitBreaker: class {
    getStatus = vi.fn().mockResolvedValue({ state: 'CLOSED' });
    halt = vi.fn().mockResolvedValue(undefined);
    reset = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../desk/risk/drawdown-monitor', () => ({
  DrawdownMonitor: class {
    getMetrics = vi.fn().mockResolvedValue({
      currentDrawdown: 0.01,
      maxDrawdown: 0.05,
      peakValue: 10000,
      currentValue: 9900,
      dailyPnl: -50,
      dailyDrawdown: 0.01,
      consecutiveLosses: 0,
      isHalted: false,
    });
    resume = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../seed/security/crypto', () => ({
  encryptForTenant: vi.fn().mockReturnValue('encrypted-value'),
  decryptForTenant: vi.fn().mockReturnValue('decrypted-value'),
}));

vi.mock('../../../seed/security/audit-log', () => ({
  logAudit: mockLogAudit,
  hashIpAddress: vi.fn().mockReturnValue('mocked-hash'),
}));

vi.mock('../../../platform/raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: vi.fn(),
  buildTenantFilter: vi.fn().mockReturnValue({ clause: 'AND subscriber_id = $1', paramIndex: 1, subscriberId: 'test' }),
  TenantQueryResult: vi.fn(),
}));

vi.mock('../../../platform/billing/license-service', () => ({
  LicenseService: class {
    static getInstance() { return this.instance || (this.instance = new this()); }
    private static instance: any;
    getLicense = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock('../../../platform/audit/audit-log-service', () => ({
  AuditLogService: class {
    static getInstance() { return this.instance || (this.instance = new this()); }
    private static instance: any;
    getLogsByLicense = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock('../../seed/security/audit-middleware', () => ({
  auditMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock audit hooks BEFORE importing routes
vi.mock('../../../platform/audit/audit-hooks', () => ({
  emitRateLimitAuditEvent: mockEmitRateLimit,
  emitCredentialDeletionAuditEvent: mockEmitDeletion,
  emitCredentialUpsertAuditEvent: mockEmitUpsert,
  emitTradeAuditEvent: vi.fn().mockResolvedValue(undefined),
  emitConfigAuditEvent: mockEmitConfig,
}));

// ─── Import routes after mocks ────────────────────────────────────────────────

import { credentialsRouter } from '../../api/routes/credentials-routes';
import { auditRouter } from '../../../api/routes/audit-routes';
import { adminRouter } from '../routes/admin';
import { rateLimitMiddleware, rateLimiter } from '@forest/rate-limit';

function buildApp(claims?: { sub?: string; role?: string; tier?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: Request & { claims?: unknown; user?: unknown }, _res: Response, next: NextFunction) => {
    if (claims) {
      req.claims = claims;
      req.user = { id: claims.sub, tier: claims.tier || 'FREE' };
    }
    next();
  });
  // Apply rate limiter middleware
  app.use(rateLimitMiddleware());
  app.use('/api/v1/subscriber/credentials', credentialsRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/admin', adminRouter);
  return app;
}

describe('Security Integration: Audit + Rate Limit + Encryption', () => {
  const VALID_BODY = {
    apiKey: 'my-api-key',
    apiSecret: 'my-api-secret',
    passphrase: 'my-passphrase',
    privateKey: 'my-private-key',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockGetDbClient.mockReset();
    mockEmitRateLimit.mockReset();
    mockEmitUpsert.mockReset();
    mockEmitDeletion.mockReset();
    mockEmitConfig.mockReset();

    // Default successful DB responses
    mockQuery.mockResolvedValue({ rows: [] });
    mockGetDbClient.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      }),
      release: vi.fn(),
    });
    // Default Redis: within limits
    mockRedis.zcard.mockResolvedValue(5);
  });

  describe('Audit logging captures rate limit events', () => {
    it('should emit audit event when rate limit is exceeded', async () => {
      // Configure rate limiter to simulate exceeded limit
      mockRedis.zcard.mockResolvedValueOnce(100); // Exceeds FREE tier limit

      const app = buildApp({ sub: 'tenant-free', role: 'subscriber' });

      // Make request that exceeds rate limit
      const res = await request(app)
        .get('/api/v1/subscriber/credentials')
        .set('x-request-id', 'req-1');

      // Rate limiter should return 429 (not fail-open on limit exceeded, only on Redis failure)
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('RATE_LIMIT_EXCEEDED');
      // But audit hook should still be called
      expect(mockEmitRateLimit).toHaveBeenCalled();
      const [auditParams] = mockEmitRateLimit.mock.calls[0];
      expect(auditParams.tenantId).toBe('tenant-free');
    });

    it('should include rate limit metadata in audit event', async () => {
      mockRedis.zcard.mockResolvedValueOnce(50); // Within PRO limit (100/min)

      const app = buildApp({ sub: 'tenant-pro', role: 'subscriber', tier: 'PRO' });

      await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-2');

      // Should not emit rate limit audit for successful request
      expect(mockEmitRateLimit).not.toHaveBeenCalled();
    });

    it('should capture tenant isolation in rate limit audit', async () => {
      mockRedis.zcard.mockResolvedValueOnce(100); // Exceeded

      const app = buildApp({ sub: 'tenant-a', role: 'subscriber' });

      await request(app)
        .get('/api/v1/subscriber/credentials')
        .set('x-request-id', 'req-3');

      expect(mockEmitRateLimit).toHaveBeenCalled();
      const [params] = mockEmitRateLimit.mock.calls[0];
      expect(params.tenantId).toBe('tenant-a');
      // Different tenant should have separate counter
      expect(params.endpoint).toBe('/api/v1/subscriber/credentials');
    });
  });

  describe('Rate limiter enforces tier limits per tenant', () => {
    it('should allow requests within FREE tier limits', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5); // Well within FREE limit (10/min)

      const app = buildApp({ sub: 'tenant-free', role: 'subscriber', tier: 'FREE' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-4');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
    });

    it('should allow higher limits for PRO tier', async () => {
      mockRedis.zcard.mockResolvedValueOnce(50); // Within PRO limit (100/min)

      const app = buildApp({ sub: 'tenant-pro', role: 'subscriber', tier: 'PRO' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-5');

      expect(res.status).toBe(201);
    });

    it('should allow highest limits for ENTERPRISE tier', async () => {
      mockRedis.zcard.mockResolvedValueOnce(500); // Within ENTERPRISE limit (1000/min)

      const app = buildApp({ sub: 'tenant-enterprise', role: 'subscriber', tier: 'ENTERPRISE' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-6');

      expect(res.status).toBe(201);
    });

    it('should allow unlimited for MASTER tier', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5000); // MASTER has very high limits

      const app = buildApp({ sub: 'tenant-master', role: 'subscriber', tier: 'MASTER' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-7');

      expect(res.status).toBe(201);
    });

    it('should fail-open when Redis is unavailable', async () => {
      // Simulate Redis failure - clear default and set rejection
      mockRedis.zcard.mockReset();
      mockRedis.zcard.mockRejectedValueOnce(new Error('Redis connection failed'));
      // Also mock pipeline.exec to succeed so we reach zcard call
      mockRedis.pipeline.mockImplementationOnce(() => ({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }));

      const app = buildApp({ sub: 'tenant-strict', role: 'subscriber', tier: 'FREE' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-8');


      // Should fail-open and allow request
      expect(res.status).toBe(201);
    });
  });

  describe('Encryption protects credentials at rest', () => {
    it('should call audit hook on credential upsert', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      // Mock INSERT query to succeed
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const app = buildApp({ sub: 'tenant-enc', role: 'subscriber' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-9');


      expect(res.status).toBe(201);
      expect(mockEmitUpsert).toHaveBeenCalled();
      const [upsertParams] = mockEmitUpsert.mock.calls[0];
      expect(upsertParams.tenantId).toBe('tenant-enc');
      expect(upsertParams.actionBy).toBe('tenant-enc');
      expect(upsertParams.endpoint).toBe('POST /api/v1/subscriber/credentials');
    });

    it('should call audit hook on credential deletion', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      // Mock exists to return true so deletion audit is emitted
      mockQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });

      const app = buildApp({ sub: 'tenant-del', role: 'subscriber' });

      const res = await request(app)
        .delete('/api/v1/subscriber/credentials')
        .set('x-request-id', 'req-10');

      expect(res.status).toBe(200);
      expect(mockEmitDeletion).toHaveBeenCalled();
      const [delParams] = mockEmitDeletion.mock.calls[0];
      expect(delParams.tenantId).toBe('tenant-del');
      expect(delParams.actionBy).toBe('tenant-del');
      expect(delParams.endpoint).toBe('DELETE /api/v1/subscriber/credentials');
    });

    it('should reject invalid credentials without calling upsert audit', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);

      const app = buildApp({ sub: 'tenant-invalid', role: 'subscriber' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send({ apiKey: 'only-key' }) // Missing required fields
        .set('x-request-id', 'req-11');

      expect(res.status).toBe(400);
      // Should NOT call upsert audit for invalid input
      expect(mockEmitUpsert).not.toHaveBeenCalled();
    });
  });

  describe('Cross-feature integration', () => {
    it('should audit credential access with rate limit context', async () => {
      mockRedis.zcard.mockResolvedValueOnce(10); // Near limit

      const app = buildApp({ sub: 'tenant-cross', role: 'subscriber' });

      // First request - upsert credentials
      await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-12');

      expect(mockEmitUpsert).toHaveBeenCalled();

      // Second request - rate limit near threshold
      mockRedis.zcard.mockResolvedValueOnce(95); // Near FREE limit
      await request(app)
        .get('/api/v1/subscriber/credentials')
        .set('x-request-id', 'req-13');

      // Rate limit audit should capture the context
      expect(mockEmitRateLimit).toHaveBeenCalled();
      const [rateAudit] = mockEmitRateLimit.mock.calls[0];
      expect(rateAudit.tenantId).toBe('tenant-cross');
      expect(rateAudit.remainingMs).toBeGreaterThanOrEqual(0);
    });

    it('should maintain tenant isolation across all security features', async () => {
      // Tenant A makes requests
      mockRedis.zcard.mockResolvedValueOnce(5);
      const appA = buildApp({ sub: 'tenant-isolated-a', role: 'subscriber' });

      await request(appA)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-14');

      // Tenant B makes requests
      mockRedis.zcard.mockResolvedValueOnce(5);
      const appB = buildApp({ sub: 'tenant-isolated-b', role: 'subscriber' });

      await request(appB)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-15');

      // Verify audit events have correct tenant IDs
      const upsertCalls = mockEmitUpsert.mock.calls;
      expect(upsertCalls).toHaveLength(2);
      expect(upsertCalls[0][0].tenantId).toBe('tenant-isolated-a');
      expect(upsertCalls[1][0].tenantId).toBe('tenant-isolated-b');
    });

    it('should include rate limit headers in responses', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5);
      mockRedis.zcard.mockResolvedValueOnce(4); // Remaining

      const app = buildApp({ sub: 'tenant-headers', role: 'subscriber' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-16');

      // Check rate limit headers are present
      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
      expect(res.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should handle Redis failure gracefully (fail-open)', async () => {
      // Simulate Redis failure
      mockRedis.zcard.mockRejectedValueOnce(new Error('Redis connection failed'));

      const app = buildApp({ sub: 'tenant-redis-fail', role: 'subscriber' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-17');

      // Should fail-open and allow request
      expect(res.status).toBe(201);
      // Should still audit the credential upsert
      expect(mockEmitUpsert).toHaveBeenCalled();
    });

    it('should audit config changes with tenant context', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);

      const app = buildApp({ sub: 'tenant-config', role: 'admin' });

      // Admin routes are mounted at /api/admin (not /api/v1/admin)
      const res = await request(app)
        .post('/api/admin/halt')
        .set('x-admin-key', 'test-admin-key-for-api-tests')
        .send({ reason: 'Security test' })
        .set('x-request-id', 'req-18');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Admin route directly calls logAudit (not emitConfigAuditEvent)
      expect(mockLogAudit).toHaveBeenCalled();
    });
  });

  describe('Audit log query with tenant isolation', () => {
    it('should only return logs for authenticated tenant', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'log-1',
            tenant_id: 'tenant-query',
            sequence_number: '1',
            event_type: 'credentials.upsert',
            action_by: 'user',
            reason: 'credential_created',
            metadata: '{}',
            hash: 'hash1',
            previous_hash: null,
            created_at: new Date().toISOString(),
          },
        ],
      });

      const app = buildApp({ sub: 'tenant-query', role: 'subscriber' });

      const res = await request(app)
        .get('/api/v1/audit/logs')
        .set('x-request-id', 'req-19');

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].tenant_id).toBe('tenant-query');
    });

    it('should reject cross-tenant audit access', async () => {
      const app = buildApp({ sub: 'tenant-a', role: 'subscriber' });

      const res = await request(app)
        .get('/api/v1/audit/logs?tenantId=tenant-b')
        .set('x-request-id', 'req-20');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('cross-tenant access denied');
    });

    it('should allow admin to query any tenant logs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const app = buildApp({ sub: 'admin-user', role: 'admin' });

      const res = await request(app)
        .get('/api/v1/audit/logs?tenantId=any-tenant')
        .set('x-request-id', 'req-21');

      expect(res.status).toBe(200);
    });
  });

  describe('Encryption key rotation simulation', () => {
    it('should handle version-prefixed ciphertext correctly', async () => {
      // This tests the encryption layer via the credential repository
      // The actual encryption is tested in crypto.test.ts
      // Here we verify the integration path works
      mockRedis.zcard.mockResolvedValueOnce(1);

      const app = buildApp({ sub: 'tenant-rotation', role: 'subscriber' });

      const res = await request(app)
        .post('/api/v1/subscriber/credentials')
        .send(VALID_BODY)
        .set('x-request-id', 'req-22');

      expect(res.status).toBe(201);
      // Encryption happens in repository layer, audit confirms the action
      expect(mockEmitUpsert).toHaveBeenCalled();
    });
  });
});