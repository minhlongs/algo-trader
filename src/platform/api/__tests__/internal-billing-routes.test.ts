/**
 * Internal Billing Routes — Unit Tests
 *
 * Covers GET /api/v1/internal/billing/usage:
 * - 401 when X-Internal-Key header missing or mismatched
 * - 400 when subscriberId missing or empty
 * - 404 when no usage snapshot found
 * - 200 with usage payload when authorized and snapshot exists
 * - 500 when usageMetering.getSnapshot throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const getSnapshotMock = vi.fn();

// vi.hoisted runs above module imports. The route module captures
// process.env.INTERNAL_BILLING_KEY at load time, and ESM import hoisting
// would place a plain assignment after the import. So set the env var here.
vi.hoisted(() => {
  process.env.INTERNAL_BILLING_KEY = 'test-internal-key-2026';
});

vi.mock('@platform/signals-api/usage-metering-service', () => ({
  usageMetering: {
    getSnapshot: (id: string) => getSnapshotMock(id),
  },
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { internalBillingRouter } from '../routes/internal-billing-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(internalBillingRouter);
  return app;
}

const VALID_KEY = 'test-internal-key-2026';

describe('Internal Billing Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('auth guard', () => {
    it('returns 401 when X-Internal-Key header is missing', async () => {
      const res = await request(buildApp()).get('/usage');
      expect(res.status).toBe(401);
    });

    it('returns 401 when X-Internal-Key does not match', async () => {
      const res = await request(buildApp())
        .get('/usage')
        .set('X-Internal-Key', 'wrong-key');
      expect(res.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('returns 400 when subscriberId is missing', async () => {
      const res = await request(buildApp())
        .get('/usage')
        .set('X-Internal-Key', VALID_KEY);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('subscriberId required');
    });

    it('returns 400 when subscriberId is empty string', async () => {
      const res = await request(buildApp())
        .get('/usage?subscriberId=')
        .set('X-Internal-Key', VALID_KEY);
      expect(res.status).toBe(400);
    });
  });

  describe('success path', () => {
    it('returns 200 with usage payload when snapshot exists', async () => {
      getSnapshotMock.mockResolvedValue({
        subscriberId: 'sub-123',
        period: '2026-09',
        callsThisPeriod: 420,
        periodLimit: 1000,
        overageCalls: 0,
      });

      const res = await request(buildApp())
        .get('/usage?subscriberId=sub-123')
        .set('X-Internal-Key', VALID_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        subscriberId: 'sub-123',
        period: '2026-09',
        callsThisPeriod: 420,
        periodLimit: 1000,
        overage: 0,
        overageCost: 0,
      });
      expect(getSnapshotMock).toHaveBeenCalledWith('sub-123');
    });

    it('returns 404 when no usage snapshot found', async () => {
      getSnapshotMock.mockResolvedValue(undefined);

      const res = await request(buildApp())
        .get('/usage?subscriberId=sub-missing')
        .set('X-Internal-Key', VALID_KEY);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No usage data for subscriber');
    });

    it('returns 500 when getSnapshot throws', async () => {
      getSnapshotMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp())
        .get('/usage?subscriberId=sub-err')
        .set('X-Internal-Key', VALID_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch usage snapshot');
    });
  });
});
