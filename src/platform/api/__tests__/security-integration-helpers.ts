import { vi, type Mock } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';

process.env.ADMIN_API_KEY = 'test-admin-key-for-api-tests';

export interface MockSecurityRedisClient {
  zremrangebyscore: Mock; zadd: Mock; zcard: Mock; expire: Mock; pipeline: Mock;
  get: Mock; hgetall: Mock; hset: Mock; set: Mock; del: Mock; keys: Mock; ping: Mock; info: Mock;
}

const mocks = vi.hoisted(() => {
  const redis = {
    zremrangebyscore: vi.fn().mockResolvedValue(0), zadd: vi.fn().mockResolvedValue(1),
    zcard: vi.fn().mockResolvedValue(0), expire: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(), zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue([]),
    })),
    get: vi.fn().mockResolvedValue(null), hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(1), set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1), keys: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue('PONG'),
    info: vi.fn().mockResolvedValue(['# Server', 'redis_version:7.0.0', 'uptime_in_seconds:86400'].join('\r\n')),
  };
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const getDbClient = vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() }),
    release: vi.fn(),
  }));
  return {
    redis, query, getDbClient,
    emitRateLimit: vi.fn().mockResolvedValue(undefined), emitUpsert: vi.fn().mockResolvedValue(undefined),
    emitDeletion: vi.fn().mockResolvedValue(undefined), emitConfig: vi.fn().mockResolvedValue(undefined),
    logAudit: vi.fn().mockResolvedValue(undefined),
  };
});

export const mockRedis: MockSecurityRedisClient = mocks.redis;
export const mockQuery: Mock = mocks.query;
export const mockGetDbClient: Mock = mocks.getDbClient;
export const mockEmitRateLimit: Mock = mocks.emitRateLimit;
export const mockEmitUpsert: Mock = mocks.emitUpsert;
export const mockEmitDeletion: Mock = mocks.emitDeletion;
export const mockEmitConfig: Mock = mocks.emitConfig;
export const mockLogAudit: Mock = mocks.logAudit;

vi.mock('../../../redis', () => ({ getRedisClient: () => mocks.redis }));
vi.mock('../../../db/postgres-client', () => ({
  query: mocks.query, getDbClient: mocks.getDbClient,
  transaction: vi.fn().mockImplementation(async (fn: (c: unknown) => unknown) => fn({
    query: vi.fn().mockResolvedValue({ rows: [{ id: 'log-123', tenant_id: 'tenant-123', sequence_number: '1', event_type: 'rate_limit.exceeded', action_by: 'system', reason: 'Rate limit exceeded', metadata: { tier: 'FREE', endpoint: '/api/v1/trades' }, hash: 'somehash', previous_hash: null, created_at: new Date().toISOString() }] }),
    release: vi.fn(),
  })),
}));
vi.mock('@shared/db/postgres-client', () => ({
  query: mocks.query, getDbClient: mocks.getDbClient,
  transaction: vi.fn().mockImplementation(async (fn: (c: unknown) => unknown) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() })),
}));
vi.mock('../../../db/trade-repository', () => ({ TradeRepository: class { getRecent = vi.fn().mockResolvedValue([]); getById = vi.fn().mockResolvedValue(null); } }));
vi.mock('../../../desk/engine', () => ({ TradingEngine: class { getOrders = () => []; } }));
vi.mock('../../../desk/wiring/qwen-drawdown-monitor', () => ({ isQwenEnabled: () => true, isKillSwitchActive: () => false }));
vi.mock('../../../desk/risk/circuit-breaker', () => ({
  CircuitBreaker: class { getStatus = vi.fn().mockResolvedValue({ state: 'CLOSED' }); halt = vi.fn().mockResolvedValue(undefined); reset = vi.fn().mockResolvedValue(undefined); },
}));
vi.mock('../../../desk/risk/drawdown-monitor', () => ({
  DrawdownMonitor: class {
    getMetrics = vi.fn().mockResolvedValue({ currentDrawdown: 0.01, maxDrawdown: 0.05, peakValue: 10000, currentValue: 9900, dailyPnl: -50, dailyDrawdown: 0.01, consecutiveLosses: 0, isHalted: false });
    resume = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('../../../seed/security/crypto', () => ({ encryptForTenant: vi.fn().mockReturnValue('encrypted-value'), decryptForTenant: vi.fn().mockReturnValue('decrypted-value') }));
vi.mock('../../../seed/security/audit-log', () => ({ logAudit: mocks.logAudit, hashIpAddress: vi.fn().mockReturnValue('mocked-hash') }));
vi.mock('../../../platform/raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: vi.fn(), buildTenantFilter: vi.fn().mockReturnValue({ clause: 'AND subscriber_id = $1', paramIndex: 1, subscriberId: 'test' }), TenantQueryResult: vi.fn(),
}));
vi.mock('../../../platform/billing/license-service', () => ({
  LicenseService: class { static instance: unknown; static getInstance() { return this.instance || (this.instance = new this()); } getLicense = vi.fn().mockResolvedValue(null); },
}));
vi.mock('../../../platform/audit/audit-log-service', () => ({
  AuditLogService: class { static instance: unknown; static getInstance() { return this.instance || (this.instance = new this()); } getLogsByLicense = vi.fn().mockResolvedValue([]); },
}));
vi.mock('../../seed/security/audit-middleware', () => ({ auditMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../../platform/audit/audit-hooks', () => ({
  emitRateLimitAuditEvent: mocks.emitRateLimit, emitCredentialDeletionAuditEvent: mocks.emitDeletion, emitCredentialUpsertAuditEvent: mocks.emitUpsert,
  emitTradeAuditEvent: vi.fn().mockResolvedValue(undefined), emitConfigAuditEvent: mocks.emitConfig,
}));

import { credentialsRouter } from '../../api/routes/credentials-routes';
import { auditRouter } from '../../../api/routes/audit-routes';
import { adminRouter } from '../routes/admin';
import { rateLimitMiddleware } from '@forest/rate-limit';

export const VALID_BODY = {
  apiKey: 'my-api-key', apiSecret: 'my-api-secret', passphrase: 'my-passphrase', privateKey: 'my-private-key',
};

export function buildApp(claims?: { sub?: string; role?: string; tier?: string }): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request & { claims?: unknown; user?: { id?: string; tier?: string } }, _res: Response, next: NextFunction) => {
    if (claims) {
      req.claims = claims;
      req.user = { id: claims.sub || 'test-tenant', tier: claims.tier || 'FREE' };
    }
    next();
  });
  app.use(rateLimitMiddleware());
  app.use('/api/v1/subscriber/credentials', credentialsRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/admin', adminRouter);
  return app;
}

export function resetSecurityMocks(): void {
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.getDbClient.mockReset();
  mocks.emitRateLimit.mockReset();
  mocks.emitUpsert.mockReset();
  mocks.emitDeletion.mockReset();
  mocks.emitConfig.mockReset();
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.getDbClient.mockResolvedValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() }),
    release: vi.fn(),
  });
  mocks.redis.zcard.mockResolvedValue(5);
}
