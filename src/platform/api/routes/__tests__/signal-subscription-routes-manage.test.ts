/**
 * Signal Subscription Routes — Management (Create, Cancel, Aliases) Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  resolveSubscriberIdMock: vi.fn(),
  signalSubscriberRepoMock: {
    getBySubscriberId: vi.fn(),
    getActiveSubscriptions: vi.fn(),
    upsert: vi.fn(),
    setActive: vi.fn(),
  },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireSignalTier: (_t?: string) => (_req: unknown, _res: unknown, next: NextFunction) => next(),
}));
vi.mock('../../../middleware/signal-tier-resolver', () => ({ resolveSubscriberId: mocks.resolveSubscriberIdMock }));
vi.mock('../../../../platform/signal/signal-subscriber-repository-d1', () => ({ signalSubscriberRepo: mocks.signalSubscriberRepoMock }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { signalSubscriptionRouter } from '../signal-subscription-routes';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalSubscriptionRouter);
  return app;
}

describe('Signal Subscription Routes — Management Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSubscriberIdMock.mockReturnValue({ subscriberId: 'user_001', tier: 'PRO' });
  });

  describe('POST /subscriptions', () => {
    it('returns 200 with subscription data for valid request', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.upsert.mockResolvedValue({
        id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const res = await request(createTestApp()).post('/api/v1/signals/subscriptions').set('Authorization', 'Bearer test-key').send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.active).toBe(true);
      expect(mocks.signalSubscriberRepoMock.upsert).toHaveBeenCalled();
    });

    it('returns 401 without API key', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue(null);
      const res = await request(createTestApp()).post('/api/v1/signals/subscriptions').send({});
      expect(res.status).toBe(401);
    });

    it('returns 400 on invalid body', async () => {
      mocks.resolveSubscriberIdMock.mockReturnValue({ subscriberId: 'user_001', tier: 'PRO' });
      const res = await request(createTestApp()).post('/api/v1/signals/subscriptions').set('Authorization', 'Bearer test-key').send({ chatId: 'not-a-number' });
      expect(res.status).toBe(400);
    });

    it('returns 500 when D1 upsert throws', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.upsert.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).post('/api/v1/signals/subscriptions').set('Authorization', 'Bearer test-key').send({});
      expect(res.status).toBe(500);
    });
  });

  describe('POST /subscriptions/subscribe', () => {
    it('returns 200 (alias for POST /subscriptions)', async () => {
      mocks.signalSubscriberRepoMock.getBySubscriberId.mockResolvedValue(null);
      mocks.signalSubscriberRepoMock.upsert.mockResolvedValue({
        id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true, createdAt: Date.now(), updatedAt: Date.now(),
      });
      const res = await request(createTestApp()).post('/api/v1/signals/subscriptions/subscribe').set('Authorization', 'Bearer test-key').send({});
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /subscriptions/:id', () => {
    it('returns 200 when subscription found', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true },
      ]);
      mocks.signalSubscriberRepoMock.setActive.mockResolvedValue(undefined);
      const res = await request(createTestApp()).delete('/api/v1/signals/subscriptions/sub_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Subscription cancelled');
    });

    it('returns 404 when subscription not found', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([]);
      const res = await request(createTestApp()).delete('/api/v1/signals/subscriptions/nonexistent').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(404);
    });

    it('returns 500 when D1 setActive throws', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_001', subscriberId: 'user_001', tier: 'PRO', active: true },
      ]);
      mocks.signalSubscriberRepoMock.setActive.mockRejectedValue(new Error('D1 down'));
      const res = await request(createTestApp()).delete('/api/v1/signals/subscriptions/sub_001').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /subscriptions/:id/unsubscribe', () => {
    it('returns 200 (alias for DELETE /:id)', async () => {
      mocks.signalSubscriberRepoMock.getActiveSubscriptions.mockResolvedValue([
        { id: 'sub_002', subscriberId: 'user_002', tier: 'FREE', active: true },
      ]);
      mocks.signalSubscriberRepoMock.setActive.mockResolvedValue(undefined);
      const res = await request(createTestApp()).delete('/api/v1/signals/subscriptions/sub_002/unsubscribe').set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Subscription cancelled');
    });
  });
});
