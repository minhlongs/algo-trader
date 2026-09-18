import { vi, type Mock } from 'vitest';
import type express from 'express';

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);
export const TEST_ADMIN_KEY: string = 'test-admin-key-for-api-tests';
export const TEST_REQUEST_ID: string = 'req-test-id';

export interface MockRedisClient {
  hgetall: Mock;
  hset: Mock;
  get: Mock;
  set: Mock;
  del: Mock;
  keys: Mock;
  ping: Mock;
  info: Mock;
  pipeline: Mock;
  zcard: Mock;
  zremrangebyscore: Mock;
  zadd: Mock;
  expire: Mock;
}

export const mockRedis: MockRedisClient = {
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockImplementation(async () => ['k1', 'k2', 'k3']),
  ping: vi.fn().mockResolvedValue('PONG'),
  info: vi.fn().mockImplementation(async () => ['# Server', 'redis_version:7.0.0', 'uptime_in_seconds:86400', '# Memory', 'used_memory:1048576', '# Stats', 'total_connections_received:100', 'total_commands_processed:5000'].join('\r\n')),
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

vi.mock('@sentry/node', () => ({
  init: vi.fn(), captureException: vi.fn(), captureMessage: vi.fn(), withScope: vi.fn((_cb, fn) => fn?.()),
  setTag: vi.fn(), setExtra: vi.fn(), setContext: vi.fn(), flush: vi.fn().mockResolvedValue(true), close: vi.fn().mockResolvedValue(true),
  Handlers: { requestHandler: () => (_req: unknown, _res: unknown, next: () => void) => next() },
}));
vi.mock('@sentry/opentelemetry', () => ({ setupOpenTelemetry: vi.fn() }));
vi.mock('../auth/auth-server', () => ({ auth: { handler: vi.fn() } }));
vi.mock('better-auth/node', () => ({ toNodeHandler: () => (_req: unknown, _res: unknown) => {} }));
vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSignalTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  canAccessFeature: () => true, FEATURE_ACCESS: {},
}));
vi.mock('../../../redis', () => ({ getRedisClient: () => mockRedis }));
vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
  transaction: vi.fn().mockImplementation(async (fn) => fn({
    query: vi.fn().mockResolvedValue({ rows: [{ id: 'log-123', tenant_id: 'tenant-123', sequence_number: '1', event_type: 'halt', action_by: 'admin', reason: 'test', metadata: {}, hash: 'somehash', previous_hash: null, created_at: new Date().toISOString() }] }),
    release: vi.fn(),
  })),
}));
vi.mock('../../../db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  getDbClient: () => ({ query: vi.fn().mockResolvedValue({ rows: [{ 1: 1 }] }), release: vi.fn() }),
}));
vi.mock('../../../db/trade-repository', () => ({
  TradeRepository: class { getRecent = vi.fn().mockResolvedValue([]); getById = vi.fn().mockResolvedValue(null); },
}));
vi.mock('../../../desk/engine', () => ({ TradingEngine: class { getOrders = () => []; } }));
vi.mock('../../../desk/wiring/qwen-drawdown-monitor', () => ({ isQwenEnabled: () => true, isKillSwitchActive: () => false }));
vi.mock('../../seed/security/audit-middleware', () => ({ auditMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../middleware/auth-middleware', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../audit/tenant-audit-log', () => ({ appendTenantAuditLog: vi.fn().mockResolvedValue(undefined), logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../../seed/security/audit-log', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../forest/rate-limit/redis-rate-limiter', () => ({
  rateLimitMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  rateLimiter: { checkRateLimit: async () => ({ allowed: true, remaining: 1000, resetAt: new Date(Date.now() + 60000) }) },
  RedisRateLimiter: class { checkRateLimit = async () => ({ allowed: true, remaining: 1000, resetAt: new Date(Date.now() + 60000) }); },
  TIER_RATE_LIMITS: {}, DEFAULT_TIER_LIMITS: {},
}));
vi.mock('../../../db/pnl-service', () => ({
  PnLService: class {
    getPerformanceMetrics = vi.fn().mockResolvedValue({ totalPnl: 100, dailyPnl: 10, weeklyPnl: 50, monthlyPnl: 80, sharpeRatio: 1.5, maxDrawdown: 0.05, winRate: 0.6, avgTrade: 1.0, bestTrade: 10.0, worstTrade: -5.0 });
    getDailySummary = vi.fn().mockResolvedValue({ date: '2026-03-20', totalProfit: 50, totalLoss: 20, netPnl: 30, tradeCount: 10, winCount: 6, lossCount: 4, winRate: 0.6, avgWin: 8.33, avgLoss: 5.0, profitFactor: 2.5 });
  },
}));

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface MockRes {
  statusCode: number; body: unknown;
  status(code: number): MockRes; json(data: unknown): void; send(data: unknown): MockRes;
  writeHead(code: number): MockRes; setHeader(_k: string, _v: string): void; removeHeader(_k: string): void; getHeader(_k: string): string | undefined;
}

let app: express.Application | null = null;
export async function getApp(): Promise<express.Application> {
  if (!app) {
    const { ApiServer } = await import('../server');
    app = new ApiServer({ port: 3001 }).getApp();
  }
  return app;
}
export function resetApp(): void {
  app = null;
}

export async function testRequest(
  method: Method, path: string, opts: { headers?: Record<string, string>; query?: Record<string, string>; params?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: unknown }> {
  const { headers = {}, query = {}, params = {}, body } = opts;
  const req = { method, url: path, headers, query, params, body: body ?? {} };
  return new Promise((resolve) => {
    const res: MockRes = {
      statusCode: 200, body: null,
      status(code: number) { res.statusCode = code; return res; },
      json(data: unknown) { res.body = data; resolve({ status: res.statusCode, body: res.body }); },
      send(data: unknown) { res.body = data; resolve({ status: res.statusCode, body: res.body }); return res; },
      writeHead(code: number) { res.statusCode = code; return res; },
      setHeader() {}, removeHeader() {}, getHeader() { return undefined; },
    };
    getApp().then((inst) => {
      inst(req as unknown as express.Request, res as unknown as express.Response, () => resolve({ status: res.statusCode, body: res.body }));
    });
  });
}
