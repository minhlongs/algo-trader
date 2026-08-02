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

describe('Debug Signals', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getBySubscriberId.mockResolvedValue(null); });

  it('debug response', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/signals/subscribe')
      .set('Authorization', 'Bearer test-key')
      .send({ chatId: 12345 });
    console.log('STATUS:', res.status);
    console.log('BODY:', JSON.stringify(res.body, null, 2));
    console.log('MOCK upsert calls:', mocks.upsert.mock.calls);
  });
});
