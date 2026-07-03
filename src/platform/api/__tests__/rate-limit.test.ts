import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { LicenseService } from '../../billing/license-service';
import { LicenseTier } from '../../../shared/types/license';

// Mock tier gating — bypass requireTier middleware for tests
vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));

// Mock Redis
const rateLimitMock = vi.fn();

const mockRedis = {
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockImplementation(async () => ['key1', 'key2', 'key3']),
  ping: vi.fn().mockResolvedValue('PONG'),
  defineCommand: vi.fn().mockImplementation(function (name: string) {
    (mockRedis as Record<string, unknown>)[name] = rateLimitMock;
  }),
  rateLimit: rateLimitMock,
  info: vi.fn().mockImplementation(async () => {
    return [
      '# Server',
      'redis_version:7.0.0',
      'uptime_in_seconds:86400',
      '# Memory',
      'used_memory:1048576',
      'used_memory_human:1.00M',
      'used_memory_rss:2097152',
      '# Stats',
      'total_connections_received:100',
      'total_commands_processed:5000',
    ].join('\r\n');
  }),
};

vi.mock('../../../redis', () => ({
  getRedisClient: () => mockRedis,
}));

// Mock PostgreSQL
const { mockLicenseQuery } = vi.hoisted(() => {
  const licenses = new Map<string, Record<string, any>>();
  const fn = vi.fn((text: string, params?: any[]) => {
    if (text.startsWith('INSERT INTO licenses')) {
      const row: Record<string, any> = {
        id: params![0], name: params![1], key: params![2],
        tier: params![3], status: params![4],
        created_at: params![5], updated_at: params![6],
        usage_count: params![7], max_usage: params![8],
        tenant_id: params![9], domain: params![10],
        expires_at: params![11],
      };
      licenses.set(row.id, row);
      return { rows: [row] };
    }
    if (text === 'SELECT * FROM licenses WHERE key = $1') {
      const rows = [...licenses.values()].filter((r: any) => r.key === params![0]);
      return { rows };
    }
    if (text === 'SELECT * FROM licenses WHERE id = $1') {
      const row = licenses.get(params![0]);
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
  return { mockLicenseQuery: fn };
});

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: () => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
  query: mockLicenseQuery,
  transaction: vi.fn().mockImplementation(async (fn) => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: 'log-123',
          tenant_id: 'tenant-123',
          sequence_number: '1',
          event_type: 'halt',
          action_by: 'admin',
          reason: 'test',
          metadata: {},
          hash: 'somehash',
          previous_hash: null,
          created_at: new Date().toISOString()
        }]
      }),
      release: vi.fn(),
    };
    return fn(mockClient as unknown as import('pg').PoolClient);
  }),
}));

// Mock TradeRepository
vi.mock('../../../db/trade-repository', () => ({
  TradeRepository: class {
    getRecent = vi.fn().mockResolvedValue([]);
    getById = vi.fn().mockResolvedValue(null);
  },
}));

// Mock PnLService
vi.mock('../../../db/pnl-service', () => ({
  PnLService: class {
    getPerformanceMetrics = vi.fn().mockResolvedValue({
      totalPnl: 100,
      dailyPnl: 10,
      weeklyPnl: 50,
      monthlyPnl: 80,
      sharpeRatio: 1.5,
      maxDrawdown: 0.05,
      winRate: 0.6,
      avgTrade: 1.0,
      bestTrade: 10.0,
      worstTrade: -5.0,
    });
    getDailySummary = vi.fn().mockResolvedValue({
      date: '2026-03-20',
      totalProfit: 50,
      totalLoss: 20,
      netPnl: 30,
      tradeCount: 10,
      winCount: 6,
      lossCount: 4,
      winRate: 0.6,
      avgWin: 8.33,
      avgLoss: 5.0,
      profitFactor: 2.5,
    });
  },
}));

describe('Distributed Rate Limiter Integration Tests', () => {
  let app: express.Application;
  let freeKey = '';
  let proKey = '';
  let enterpriseKey = '';

  beforeAll(async () => {
    // Set environment variables
    process.env.ADMIN_API_KEY = 'test-admin-key-for-rate-limiting';
    process.env.METRICS_TOKEN = 'test-metrics-token';
    process.env.BETTER_AUTH_SECRET = 'test-auth-secret';

    // Create test licenses
    const licenseService = LicenseService.getInstance();

    const freeLic = await licenseService.createLicense({
      name: 'Free License',
      tier: LicenseTier.FREE,
      tenantId: 'tenant-free',
    });
    freeKey = freeLic.key;

    const proLic = await licenseService.createLicense({
      name: 'Pro License',
      tier: LicenseTier.PRO,
      tenantId: 'tenant-pro',
    });
    proKey = proLic.key;

    const enterpriseLic = await licenseService.createLicense({
      name: 'Enterprise License',
      tier: LicenseTier.ENTERPRISE,
      tenantId: 'tenant-enterprise',
    });
    enterpriseKey = enterpriseLic.key;

    // Load server
    const { ApiServer } = await import('../server');
    const apiServer = new ApiServer({ port: 3002 });
    app = apiServer.getApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.rateLimit = rateLimitMock;
  });

  describe('Allowed Requests and Pricing Tiers', () => {
    it('should allow requests under the limit for FREE tier', async () => {
      rateLimitMock.mockResolvedValue([1, 1]); // [allowed, currentCount]

      const res = await request(app)
        .get('/api/trades')
        .set('x-api-key', freeKey);

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('9');
      expect(rateLimitMock).toHaveBeenCalledWith('ratelimit:{tenant-free}', expect.any(Number), 60000, 10);
    });

    it('should allow requests under the limit for PRO tier', async () => {
      rateLimitMock.mockResolvedValue([1, 25]); // [allowed, currentCount]

      const res = await request(app)
        .get('/api/trades')
        .set('x-api-key', proKey);

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('100');
      expect(res.headers['x-ratelimit-remaining']).toBe('75');
      expect(rateLimitMock).toHaveBeenCalledWith('ratelimit:{tenant-pro}', expect.any(Number), 60000, 100);
    });

    it('should allow requests under the limit for ENTERPRISE tier', async () => {
      rateLimitMock.mockResolvedValue([1, 200]); // [allowed, currentCount]

      const res = await request(app)
        .get('/api/trades')
        .set('Authorization', `Bearer ${enterpriseKey}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('1000');
      expect(res.headers['x-ratelimit-remaining']).toBe('800');
      expect(rateLimitMock).toHaveBeenCalledWith('ratelimit:{tenant-enterprise}', expect.any(Number), 60000, 1000);
    });

    it('should allow anonymous/invalid key requests under the FREE tier limit', async () => {
      rateLimitMock.mockResolvedValue([1, 2]); // [allowed, currentCount]

      const res = await request(app)
        .get('/api/trades');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('8');
      expect(rateLimitMock).toHaveBeenCalledWith(expect.stringMatching(/^ratelimit:\{.+\}$/), expect.any(Number), 60000, 10);
    });
  });

  describe('Blocked Requests', () => {
    it('should return HTTP 429 when limits are exceeded', async () => {
      rateLimitMock.mockResolvedValue([0, 10]); // [blocked, currentCount]

      const res = await request(app)
        .get('/api/trades')
        .set('x-api-key', freeKey);

      expect(res.status).toBe(429);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('0');
      expect(res.body).toEqual({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Upgrade your plan for higher limits.',
        tier: LicenseTier.FREE,
        limit: 10,
      });
    });
  });

  describe('Excluded Routes', () => {
    it('should bypass rate limiting for health endpoints', async () => {
      rateLimitMock.mockResolvedValue([0, 10]); // Block all requests normally

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(rateLimitMock).not.toHaveBeenCalled();
    });

    it('should bypass rate limiting for webhooks endpoints', async () => {
      rateLimitMock.mockResolvedValue([0, 10]); // Block all requests normally

      const res = await request(app).post('/api/webhooks/nowpayments');

      // The route will return 400/401 due to signature mismatch, but NOT 429
      expect(res.status).not.toBe(429);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(rateLimitMock).not.toHaveBeenCalled();
    });
  });

  describe('Fail-Open Behavior', () => {
    it('should fail-open and allow the request to proceed if Redis throws an error', async () => {
      rateLimitMock.mockRejectedValue(new Error('Redis connection refused'));

      const res = await request(app)
        .get('/api/trades')
        .set('x-api-key', proKey);

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });
  });
});
