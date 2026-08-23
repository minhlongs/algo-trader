import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  getBySubscriberId: vi.fn(),
  upsert: vi.fn(),
  setWebhook: vi.fn(),
}));

vi.mock('../../signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: {
    getBySubscriberId: mocks.getBySubscriberId,
    upsert: mocks.upsert,
    setWebhook: mocks.setWebhook,
  },
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireSignalTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: () => ({ subscriberId: 'user_001', tier: 'PRO' }),
}));

import { signalsApiRouter } from '../../signals-api-routes.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalsApiRouter);
  return app;
}

describe('Deprecated signals API shim', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getBySubscriberId.mockResolvedValue(null); });

  it('returns 410 Gone with migration hint and persists nothing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/signals/subscribe')
      .set('Authorization', 'Bearer test-key')
      .send({ chatId: 12345 });
    expect(res.status).toBe(410);
    expect(res.body.error).toContain('/api/v1/signals/subscriptions');
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
