/**
 * Signal Feed Routes — Integration Tests
 *
 * Tests: GET /feed, GET /feed/:id (canonical feed router), GET /stream (SSE)
 *
 * Feed list + single lookup live in signal-feed-api-routes.ts (mounted at /api/v1/signals).
 * SSE stream lives in signal-feed-routes.ts (same mount point).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockLiveSignals = [
  { id: 'sig-001', ts: Date.now(), market: 'BTC/USD', side: 'buy', size: 0.85, confidence: 0.9, strategy: 'arb', ttl: 300, expiresAt: Date.now() + 300000 },
  { id: 'sig-002', ts: Date.now(), market: 'ETH/USD', side: 'sell', size: 0.72, confidence: 0.8, strategy: 'arb', ttl: 300, expiresAt: Date.now() + 300000 },
];

// Mock paths from src/platform/api/routes/__tests__/ to src/platform/
vi.mock('../../../../platform/middleware/feature-gate', () => ({
  requireSignalTier: () => (_req: any, _res: any, next: any) => next(),
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../platform/middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: () => ({ subscriberId: 'user_001', tier: 'PRO' }),
}));

vi.mock('../../../../platform/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../desk/signal/signal-ttl-enforcer', () => ({
  signalTtlEnforcer: {
    getLive: vi.fn(() => mockLiveSignals),
  },
}));

vi.mock('../../../../desk/signal/signal-rest-cache', () => ({
  getCachedSignals: vi.fn(() => null),
  setCachedSignals: vi.fn(),
}));

vi.mock('../../../../desk/signal/signal-tier-filter', () => ({
  filterSignalsForTier: vi.fn((signals) => signals),
  canAccessSse: vi.fn((_tier: string) => false), // all tiers denied by default
}));

vi.mock('../../../../platform/desk/gate/raas-gate', () => ({
  default: {
    getInstance: () => ({
      validateApiKey: vi.fn(() => ({ tier: 'PRO', userId: 'user_001', id: 'lic_001' })),
    }),
  },
}));

vi.mock('../../../../desk/signal/sse-signal-broadcaster', () => ({
  sseBroadcaster: {
    subscribe: vi.fn((res: any) => { res.status(200).end(); }),
  },
}));

// Import AFTER mocks
import { signalFeedRouter } from '../signal-feed-api-routes';
import { signalFeedRouter as sseRouter } from '../signal-feed-routes';

function buildFeedApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalFeedRouter);
  return app;
}

function buildSseApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', sseRouter);
  return app;
}

describe('Signal Feed Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /feed (canonical feed)', () => {
    it('returns 200 with paginated signals', async () => {
      const app = buildFeedApp();
      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('accepts since and limit query params', async () => {
      const app = buildFeedApp();
      const res = await request(app)
        .get('/api/v1/signals/feed?since=0&limit=5')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.count).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /feed/:id (single lookup)', () => {
    it('returns 200 for existing signal', async () => {
      const app = buildFeedApp();
      const res = await request(app)
        .get('/api/v1/signals/feed/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('sig-001');
    });

    it('returns 404 for unknown signal', async () => {
      const app = buildFeedApp();
      const res = await request(app)
        .get('/api/v1/signals/feed/nonexistent')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /stream (SSE)', () => {
    it('returns 403 because SSE requires ENTERPRISE not PRO', async () => {
      const app = buildSseApp();
      const res = await request(app)
        .get('/api/v1/signals/stream')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(403);
    });
  });
});
