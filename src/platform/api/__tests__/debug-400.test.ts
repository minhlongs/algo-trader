import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

// same mocks as api.test.ts
vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSignalTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));
vi.mock('@platform/seed/security/audit-middleware', () => ({
  auditMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockRedis = {
  hgetall: vi.fn().mockResolvedValue({}), hset: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockImplementation(async () => ['key1','key2','key3']),
  ping: vi.fn().mockResolvedValue('PONG'),
  defineCommand: vi.fn().mockImplementation(function (name: string) { (this as Record<string, unknown>)[name] = vi.fn().mockResolvedValue([1,1]); }),
  rateLimit: vi.fn().mockResolvedValue([1, 1]),
  info: vi.fn().mockResolvedValue('# Server\r\nredis_version:7.0.0\r\n'),
};
vi.mock('@redis', () => ({ getRedisClient: () => mockRedis }));
vi.mock('@platform/db/postgres-client', () => ({
  getDbClient: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
}));
vi.mock('@platform/desk/engine', () => ({
  TradingEngine: class { getOrders() { return []; } },
}));

// Bypass rate-limit middleware
vi.mock('@platform/forest/rate-limit', () => ({
  rateLimitMiddleware: () => (_req: any, _res: any, next: any) => next(),
}));

describe('debug 400', () => {
  let app: express.Application;
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    const { ApiServer } = await import('../server');
    app = new ApiServer({ port: 3001 }).getApp();
  });
  it('shows body for /health 400', async () => {
    const res = await request(app).get('/health');
  console.log('DEBUG status=', res.status, 'body=', JSON.stringify(res.body));
  console.log('DEBUG ratelimit=', res.headers['x-ratelimit-limit']);
  console.log('DEBUG mockCalls=', JSON.stringify(mockRedis.rateLimit.mock.calls.slice(-3)));
  });
});
