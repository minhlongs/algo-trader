import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// Set required env before any imports
process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64); // 64 hex chars = 32 bytes

// Mock @sentry/node to prevent unresolvable @opentelemetry/sdk-trace-base import chain in vitest forks
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn((_cb, fn) => fn?.()),
  setTag: vi.fn(),
  setExtra: vi.fn(),
  setContext: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  close: vi.fn().mockResolvedValue(true),
  Handlers: { requestHandler: () => (_req: unknown, _res: unknown, next: () => void) => next() },
}));

// Mock redis to prevent real connection
vi.mock('../../../redis', () => ({
  getRedisClient: () => ({
    ping: () => Promise.resolve('PONG'),
    info: () => Promise.resolve('redis_version:7.0.0'),
  }),
}));

// Mock postgres client
vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: () => ({
    query: () => Promise.resolve({ rows: [], rowCount: 0 }),
    connect: () => Promise.resolve(),
    release: () => {},
  }),
}));

// Mock TradingEngine
vi.mock('../../../desk/engine', () => ({
  TradingEngine: class { static getStatus() { return 'idle'; } },
}));
vi.mock('@sentry/opentelemetry', () => ({
  setupOpenTelemetry: vi.fn(),
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSignalTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));

vi.mock('../../../../seed/security/audit-log', () => ({
  logAudit: () => Promise.resolve(),
}));

const mockRedis = {
  hgetall: vi.fn().mockResolvedValue({}),
  hset: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockImplementation(async () => ['key1', 'key2', 'key3']),
  ping: vi.fn().mockResolvedValue('PONG'),
  defineCommand: vi.fn().mockImplementation(function (name: string) {
    (this as Record<string, unknown>)[name] = vi.fn().mockResolvedValue([1, 1]);
  }),
  rateLimit: vi.fn().mockResolvedValue([1, 1]),
  info: vi.fn().mockResolvedValue('# Server\r\nredis_version:7.0.0\r\n'),
};
vi.mock('@redis', () => ({ getRedisClient: () => mockRedis }));
vi.mock('../../../db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock('@platform/desk/engine', () => ({
  TradingEngine: class { getOrders() { return []; } },
}));

vi.mock('../../forest/rate-limit/redis-rate-limiter', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/auth-middleware', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../seed/security/audit-middleware', () => ({
  auditMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

describe('debug 400', () => {
  let app: express.Application;
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    const { ApiServer } = await import('../server');
    app = new ApiServer({ port: 3001 }).getApp();
  });
  it('shows body for /health 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });
});
