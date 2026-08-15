import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Set required env before any imports
process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64); // 64 hex chars = 32 bytes

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRedis = {
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockImplementation(async () => ['k1', 'k2', 'k3']),
  ping: vi.fn().mockResolvedValue('PONG'),
  info: vi.fn().mockImplementation(async () =>
    [
      '# Server',
      'redis_version:7.0.0',
      'uptime_in_seconds:86400',
      '# Memory',
      'used_memory:1048576',
      '# Stats',
      'total_connections_received:100',
      'total_commands_processed:5000',
    ].join('\r\n')
  ),
  // Sorted set operations used by rate limiter
  pipeline: vi.fn(() => ({
    zremrangebyscore: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
  zcard: vi.fn().mockResolvedValue(0),
  zremrangebyscore: vi.fn().mockResolvedValue(0),
  zadd: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
};

// ─── Module mocks ────────────────────────────────────────────────────────────

// Mock auth-server to prevent pg.Pool creation during ApiServer initialization
vi.mock('../auth/auth-server', () => ({
  auth: { handler: vi.fn() },
}));

vi.mock('better-auth/node', () => ({
  toNodeHandler: () => (_req: unknown, _res: unknown) => {},
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req, _res, next) => next(),
  requireFeature: () => (_req, _res, next) => next(),
  requireSignalTier: () => (_req, _res, next) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));

vi.mock('../../../redis', () => ({
  getRedisClient: () => mockRedis,
}));

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: () => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
  transaction: vi.fn().mockImplementation(async (fn) => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'log-123',
            tenant_id: 'tenant-123',
            sequence_number: '1',
            event_type: 'halt',
            action_by: 'admin',
            reason: 'test',
            metadata: {},
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

// audit-log imports { query } from ../../db/postgres-client
vi.mock('../../../db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  getDbClient: () => ({
    query: vi.fn().mockResolvedValue({ rows: [{ 1: 1 }] }),
    release: vi.fn(),
  }),
}));

vi.mock('../../../db/trade-repository', () => ({
  TradeRepository: class {
    getRecent = vi.fn().mockResolvedValue([]);
    getById = vi.fn().mockResolvedValue(null);
  },
}));

vi.mock('../../../redis', () => ({
  getRedisClient: () => mockRedis,
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

vi.mock('../../seed/security/audit-middleware', () => ({
  auditMiddleware: () => (_req, _res, next) => next(),
}));

vi.mock('../middleware/auth-middleware', () => ({
  authMiddleware: (_req, _res, next) => next(),
}));

vi.mock('../../audit/tenant-audit-log', () => ({
  appendTenantAuditLog: vi.fn().mockResolvedValue(undefined),
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../forest/rate-limit/redis-rate-limiter', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
  rateLimiter: { checkRateLimit: async () => ({ allowed: true, remaining: 1000, resetAt: new Date(Date.now() + 60000) }) },
  RedisRateLimiter: class { checkRateLimit = async () => ({ allowed: true, remaining: 1000, resetAt: new Date(Date.now() + 60000) }) },
  TIER_RATE_LIMITS: {},
  DEFAULT_TIER_LIMITS: {},
}));

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

// ─── Test helpers ─────────────────────────────────────────────────────────────

// Types for our mock request/response
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface MockReq {
  method: Method;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(data: unknown): void;
  send(data: unknown): MockRes;
  writeHead(code: number): MockRes;
  setHeader(_key: string, _value: string): void;
  removeHeader(_key: string): void;
  getHeader(_key: string): string | undefined;
}

function createMockRes(onComplete: () => void): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      onComplete();
    },
    send(data: unknown) {
      res.body = data;
      onComplete();
      return res;
    },
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    setHeader() {},
    removeHeader() {},
    getHeader() { return undefined; },
  };
  return res;
}

// Lazily loaded Express app — created once on first request
let app: express.Application | null = null;

async function getApp(): Promise<express.Application> {
  if (!app) {
    const { ApiServer } = await import('../server');
    const server = new ApiServer({ port: 3001 });
    app = server.getApp();
  }
  return app;
}

/**
 * Send a plain Express request by calling the app's middleware stack directly.
 * This avoids supertest and uses Express's own routing.
 */
async function testRequest(
  method: Method,
  path: string,
  opts: {
    headers?: Record<string, string>;
    query?: Record<string, string>;
    params?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: unknown }> {
  const { headers = {}, query = {}, params = {}, body } = opts;

  // Build the base req object
  const req: MockReq = {
    method,
    url: path,
    headers,
    query,
    params,
    body: body ?? {},
  };

  // Create mock res with completion callback
  let resolve: (value: { status: number; body: unknown }) => void;
  const promise = new Promise<{ status: number; body: unknown }>((res) => {
    resolve = res;
  });

  const res = createMockRes(() => {
    resolve({ status: res.statusCode, body: res.body });
  });

  // getApp() returns the full Express app with all middleware/routes attached
  const instance = await getApp();

  // Invoke the application directly — Express handles all routing
  instance(req as express.Request, res as express.Response, () => {
    resolve({ status: res.statusCode, body: res.body });
  });

  return promise;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('API Server', () => {
  const TEST_ADMIN_KEY = 'test-admin-key-for-api-tests';
  const TEST_REQUEST_ID = 'req-test-id';

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
  });

  afterAll(() => {
    // Reset module-level app to avoid state leaking between test files
    app = null;
  });

  describe('Health Endpoints', () => {
    it('GET /health should return healthy status', { timeout: 15_000 }, async () => {
      const { status, body } = await testRequest('GET', '/health', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.status).toBe('healthy');
      expect(json.version).toBeDefined();
      expect(typeof json.uptime).toBe('number');
      expect(json.uptime).toBeGreaterThanOrEqual(0);
      expect((json.components as Record<string, string>).redis).toBe('ok');
      expect((json.components as Record<string, string>).tradingEngine).toBe('ok');
      expect(json.memory).toBeDefined();
      expect(json.paperTrading).toBeDefined();
    });

    it('GET /health exposes fable-5 rollback booleans', { timeout: 15_000 }, async () => {
      const { status, body } = await testRequest('GET', '/health', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.qwen).toBeDefined();
      expect(typeof (json.qwen as Record<string, boolean>).enabled).toBe('boolean');
      expect(typeof (json.qwen as Record<string, boolean>).killSwitchActive).toBe('boolean');
    });

    it('GET /health/metrics should return system metrics', { timeout: 15_000 }, async () => {
      const { status, body } = await testRequest('GET', '/health/metrics', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.redis).toBeDefined();
      expect((json.redis as Record<string, unknown>).keys_count).toBeDefined();
      expect(json.process).toBeDefined();
      expect(json.version).toBeDefined();
    });
  });

  describe('Trades Endpoints', () => {
    it('GET /api/trades should return empty list', async () => {
      const { status, body } = await testRequest('GET', '/api/trades', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.data).toEqual([]);
      expect(json.total).toBe(0);
    });

    it('GET /api/trades/:id should return 404 for non-existent trade', async () => {
      const { status, body } = await testRequest('GET', '/api/trades/non-existent', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
        params: { id: 'non-existent' },
      });

      expect(status).toBe(404);
      const json = body as Record<string, unknown>;
      expect(json.error).toBe('Trade not found');
    });
  });

  describe('P&L Endpoints', () => {
    it('GET /api/pnl should return performance metrics', async () => {
      const { status, body } = await testRequest('GET', '/api/pnl', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.totalPnl).toBe(100);
      expect(json.winRate).toBe(0.6);
      expect(json.sharpeRatio).toBe(1.5);
    });

    it('GET /api/pnl/daily should return daily summary', async () => {
      const { status, body } = await testRequest('GET', '/api/pnl/daily', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.tradeCount).toBe(10);
      expect(json.winRate).toBe(0.6);
      expect(json.netPnl).toBe(30);
    });
  });

  describe('Signals Endpoints', () => {
    it('GET /api/signals should return empty signals', async () => {
      const { status, body } = await testRequest('GET', '/api/signals', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.data).toEqual([]);
      expect(json.count).toBe(0);
    });

    it('GET /api/signals?minSpread=0.5 should filter by spread', async () => {
      const { status, body } = await testRequest('GET', '/api/signals?minSpread=0.5', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
        query: { minSpread: '0.5' },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.data).toEqual([]);
    });
  });

  describe('Admin Endpoints', () => {
    it('POST /api/admin/halt should halt trading', async () => {
      const { status, body } = await testRequest('POST', '/api/admin/halt', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
        body: { reason: 'Testing' },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.success).toBe(true);
    });

    it('POST /api/admin/halt should reject without reason', async () => {
      const { status, body } = await testRequest('POST', '/api/admin/halt', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
        body: { reason: '' },
      });

      expect(status).toBe(400);
      const json = body as Record<string, unknown>;
      expect(json.error).toBe('Reason is required');
    });

    it('POST /api/admin/resume should resume trading', async () => {
      const { status, body } = await testRequest('POST', '/api/admin/resume', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.success).toBe(true);
    });

    it('GET /api/admin/status should return system status', async () => {
      const { status, body } = await testRequest('GET', '/api/admin/status', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
      });

      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.trading).toBeDefined();
      expect(json.circuitBreaker).toBeDefined();
      expect(json.drawdown).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const { status, body } = await testRequest('GET', '/api/unknown', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });

      expect(status).toBe(404);
      const json = body as Record<string, unknown>;
      expect(json.error).toBe('Not found');
    });
  });
});
