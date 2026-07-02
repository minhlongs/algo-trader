/**
 * Signal Feed Routes — Integration Tests
 *
 * Tests: GET /, GET /:id, GET /stream
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockLiveSignals = [
  { id: 'sig-001', ts: Date.now(), symbol: 'BTC/USD', action: 'buy', confidence: 0.85 },
  { id: 'sig-002', ts: Date.now(), symbol: 'ETH/USD', action: 'sell', confidence: 0.72 },
];

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
  canAccessSse: vi.fn(() => true),
}));

vi.mock('../../../../desk/gate/raas-gate', () => ({
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

import { signalFeedRouter } from '../signal-feed-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalFeedRouter);
  return app;
}

describe('Signal Feed Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('returns 200 with paginated signals', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('tier');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('accepts since and limit query params', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals?since=0&limit=5')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /stream', () => {
    it('returns 200 for PRO tier SSE stream', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals/stream')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /:id', () => {
    it('returns 200 for existing signal', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('sig-001');
    });

    it('returns 404 for unknown signal', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals/nonexistent')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(404);
    });
  });
});
