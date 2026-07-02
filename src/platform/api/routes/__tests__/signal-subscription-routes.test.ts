/**
 * Signal Subscription Routes — Integration Tests
 *
 * Tests: POST /subscribe, POST /unsubscribe, GET /subscription
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

vi.mock('../../../../desk/gate/raas-gate', () => ({
  default: {
    getInstance: () => ({
      validateApiKey: vi.fn(() => ({ tier: 'PRO', userId: 'user_001', id: 'lic_001' })),
    }),
  },
}));

import { signalSubscriptionRouter } from '../signal-subscription-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals/subscriptions', signalSubscriptionRouter);
  return app;
}

describe('Signal Subscription Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /subscribe', () => {
    it('returns 200 with subscription data for valid request', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.active).toBe(true);
      expect(res.body).toHaveProperty('message');
    });

    it('returns 401 without API key header', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions/subscribe')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('POST /unsubscribe', () => {
    it('returns 200 when subscription exists', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions/unsubscribe')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });

    it('returns 401 without API key', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/signals/subscriptions/unsubscribe');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /subscription', () => {
    it('returns 200 when subscribed', async () => {
      // Subscribe first
      const app = buildApp();
      await request(app)
        .post('/api/v1/signals/subscriptions/subscribe')
        .set('Authorization', 'Bearer test-key')
        .send({});

      const res = await request(app)
        .get('/api/v1/signals/subscriptions/subscription')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(true);
    });
  });
});
