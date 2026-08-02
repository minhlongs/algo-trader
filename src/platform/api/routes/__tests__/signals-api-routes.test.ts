/**
 * Signals API Routes — Regression Tests
 *
 * Contract:
 * - POST /signals/subscribe -> creates subscription in D1.
 * - GET /signals/feed -> returns 410 deprecation redirect.
 * - POST /signals/webhook -> persists webhook URL in D1.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock RaasGate to avoid initializing the real singleton during module load.
vi.mock('../../../desk/gate/raas-gate', () => ({
  default: {
    getInstance: () => ({
      validateApiKey: vi.fn(() => ({ tier: 'PRO', userId: 'user_001', id: 'lic_001' })),
    }),
  },
}));

// Mock D1-backed subscriber repo.
const mocks = vi.hoisted(() => ({
  getBySubscriberId: vi.fn(),
  upsert: vi.fn(),
  setWebhook: vi.fn(),
}));

vi.mock('../../../../platform/signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: {
    getBySubscriberId: mocks.getBySubscriberId,
    upsert: mocks.upsert,
    setWebhook: mocks.setWebhook,
  },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireSignalTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { signalsApiRouter } from '../signals-api-routes';
import { __setGate } from '../../../middleware/signal-tier-resolver';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalsApiRouter);
  return app;
}

describe('Signals API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBySubscriberId.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(undefined);
    mocks.setWebhook.mockResolvedValue(undefined);

    // Use official resolver mock hook so resolveSubscriberId returns a valid identity.
    __setGate({
      validateApiKey: () => ({ tier: 'PRO', userId: 'user_001', id: 'lic_001' }),
    } as any);
  });

  it('creates a subscription', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/signals/subscribe')
      .set('Authorization', 'Bearer test-key')
      .send({ chatId: 12345 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('message', 'Subscribed successfully');
  });

  it('returns 410 from deprecated /feed alias', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/api/v1/signals/feed')
      .set('Authorization', 'Bearer test-key');

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('Use /api/v1/signals/feed from signal-feed-routes');
  });

  it('registers a webhook URL', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/signals/webhook')
      .set('Authorization', 'Bearer test-key')
      .send({ url: 'https://example.com/signals/callback' });

    expect(res.status).toBe(200);
    expect(mocks.setWebhook).toHaveBeenCalled();
  });
});
