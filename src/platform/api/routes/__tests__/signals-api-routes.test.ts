/**
 * Signals API Routes — Integration Tests
 *
 * Tests: POST /subscribe, GET /feed, POST /webhook, tier gating
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Hoisted state — toggle blockAccess per test to simulate tier gating
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  blockAccess: false,
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireSignalTier: () => (req: any, res: any, next: any) => {
    if (mocks.blockAccess) {
      res.status(403).json({ error: 'Insufficient tier', required: 'PRO' });
      return;
    }
    next();
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockLiveSignals = [
  {
    id: 'sig-001',
    ts: Date.now() - 1000,
    market: 'BTC-USD',
    side: 'BUY' as const,
    size: 0.5,
    confidence: 0.85,
    strategy: 'qwen-m1max-v1',
    ttl: 300,
    expiresAt: Date.now() + 299000,
  },
  {
    id: 'sig-002',
    ts: Date.now() - 2000,
    market: 'ETH-USD',
    side: 'SELL' as const,
    size: 0.3,
    confidence: 0.72,
    strategy: 'deepseek-m1max-v1',
    ttl: 300,
    expiresAt: Date.now() + 298000,
  },
];

vi.mock('../../../../desk/signal/signal-ttl-enforcer', () => ({
  signalTtlEnforcer: {
    getLive: vi.fn(() => mockLiveSignals),
  },
}));

vi.mock('../../../../desk/signal/signal-tier-filter', () => ({
  filterSignalsForTier: vi.fn((signals: unknown[]) => signals),
}));

vi.mock('../../../../desk/signal/signal-rest-cache', () => ({
  getCachedSignals: vi.fn(() => null),
  setCachedSignals: vi.fn(),
}));

vi.mock('../../../../desk/gate/raas-gate', () => ({
  default: {
    getInstance: () => ({
      validateApiKey: vi.fn(() => ({ tier: 'PRO', userId: 'user_001', id: 'lic_001' })),
    }),
  },
}));

import { signalsApiRouter } from '../signals-api-routes';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalsApiRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Signals API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockAccess = false; // allow all requests by default
  });

  // ==================== POST /subscribe ====================
  describe('POST /subscribe', () => {
    it('creates a subscription', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({ chatId: 12345 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('active', true);
      expect(res.body.data).toHaveProperty('subscriberId', 'user_001');
      expect(res.body.data).toHaveProperty('tier', 'PRO');
      expect(res.body).toHaveProperty('message', 'Subscribed successfully');
    });

    it('accepts subscribe without optional chatId', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(true);
    });

    it('returns 400 for invalid body', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({ chatId: 'not-a-number' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== GET /feed ====================
  describe('GET /feed', () => {
    it('returns 200 with signals and rate limit headers', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('tier', 'PRO');
      expect(res.body).toHaveProperty('cached', false);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });

    it('accepts since and limit query params', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals/feed?since=0&limit=5')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid limit', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/signals/feed?limit=999')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(400);
    });
  });

  // ==================== POST /webhook ====================
  describe('POST /webhook', () => {
    it('registers a webhook URL', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/webhook')
        .set('Authorization', 'Bearer test-key')
        .send({ url: 'https://example.com/signals/callback' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('url', 'https://example.com/signals/callback');
      expect(res.body).toHaveProperty('message', 'Webhook registered');
    });

    it('returns 400 for invalid URL', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/webhook')
        .set('Authorization', 'Bearer test-key')
        .send({ url: 'not-a-url' });

      expect(res.status).toBe(400);
    });
  });

  // ==================== Tier gating ====================
  describe('Tier gating', () => {
    it('rejects request with insufficient tier', async () => {
      mocks.blockAccess = true;

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscribe')
        .set('Authorization', 'Bearer free-key')
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient tier');
    });
  });
});
