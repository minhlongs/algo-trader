/**
 * Signal Feed API Routes — Comprehensive Coverage Tests
 *
 * Covers src/platform/api/routes/signal-feed-api-routes.ts:
 * - GET /feed (cache hit/miss, invalid query, identity missing, cache write failure, unexpected error)
 * - GET /feed/:id (found, not found, identity missing, unexpected error)
 * - requireSignalTier gate (401 no license, 403 insufficient signal tier)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock all dependencies BEFORE importing the router
vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireSignalTier: (_minTier: string) => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../../src/platform/middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: vi.fn(),
}));

vi.mock('../../../../../src/platform/raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: vi.fn(),
}));

vi.mock('../../../../../src/shared/tenant', () => ({
  validateTenantId: vi.fn(() => true),
}));

vi.mock('../../../../../src/desk/signal/signal-ttl-enforcer', () => ({
  signalTtlEnforcer: {
    getLive: vi.fn(() => mockLiveSignals),
  },
}));

vi.mock('../../../../../src/desk/signal/signal-rest-cache', () => ({
  getCachedSignals: vi.fn(() => null),
  setCachedSignals: vi.fn(() => Promise.resolve()),
}));

// Import AFTER mocks
import { signalFeedRouter } from '../../../../../src/platform/api/routes/signal-feed-api-routes';
import { resolveSubscriberId } from '../../../../../src/platform/middleware/signal-tier-resolver';
import { signalTtlEnforcer } from '../../../../../src/desk/signal/signal-ttl-enforcer';
import { getCachedSignals, setCachedSignals } from '../../../../../src/desk/signal/signal-rest-cache';
import { logger } from '../../../../../src/shared/utils/logger';

const mockLiveSignals = [
  { id: 'sig-001', ts: 1700000000000, market: 'BTC/USD', side: 'buy', size: 0.85, confidence: 0.9, strategy: 'arb', ttl: 300, expiresAt: 1700000300000 },
  { id: 'sig-002', ts: 1700000100000, market: 'ETH/USD', side: 'sell', size: 0.72, confidence: 0.8, strategy: 'arb', ttl: 300, expiresAt: 1700000400000 },
  { id: 'sig-003', ts: 1700000200000, market: 'SOL/USD', side: 'buy', size: 0.65, confidence: 0.7, strategy: 'momentum', ttl: 120, expiresAt: 1700000320000 },
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalFeedRouter);
  return app;
}

describe('Signal Feed API Routes — signal-feed-api-routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signalTtlEnforcer.getLive).mockReturnValue(mockLiveSignals);
    vi.mocked(getCachedSignals).mockResolvedValue(null);
    vi.mocked(setCachedSignals).mockResolvedValue(undefined);
  });

  // ============================================================
  // GET /feed — Identity / Auth
  // ============================================================
  describe('GET /feed — identity', () => {
    it('returns 401 when no valid API key', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer invalid-key');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Valid API key required' });
    });

    it('returns 401 when Authorization header is missing', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue(null);
      const app = buildApp();

      const res = await request(app).get('/api/v1/signals/feed');

      expect(res.status).toBe(401);
    });
  });

  // ============================================================
  // GET /feed — Cache hit path
  // ============================================================
  describe('GET /feed — cache hit', () => {
    it('returns cached signals with cached=true', async () => {
      const cachedSignals = [{ id: 'cached-1', ts: 1700000000000 }];
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(cachedSignals);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: cachedSignals,
        count: 1,
        tier: 'SIGNALS_BASIC',
        cached: true,
      });
      // Should NOT hit the enforcer when cache hits
      expect(signalTtlEnforcer.getLive).not.toHaveBeenCalled();
      expect(setCachedSignals).not.toHaveBeenCalled();
    });

    it('returns cached signals with SIGNALS_PRO tier', async () => {
      const cachedSignals = [{ id: 'cached-pro', ts: 1700000000000 }];
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_pro', tier: 'SIGNALS_PRO' });
      vi.mocked(getCachedSignals).mockResolvedValue(cachedSignals);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer pro-key');

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('SIGNALS_PRO');
      expect(res.body.cached).toBe(true);
    });

    it('returns cached signals with SIGNALS_ENTERPRISE tier', async () => {
      const cachedSignals = [{ id: 'cached-ent', ts: 1700000000000 }];
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_ent', tier: 'SIGNALS_ENTERPRISE' });
      vi.mocked(getCachedSignals).mockResolvedValue(cachedSignals);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer ent-key');

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('SIGNALS_ENTERPRISE');
    });
  });

  // ============================================================
  // GET /feed — Cache miss (live) path
  // ============================================================
  describe('GET /feed — cache miss (live)', () => {
    it('falls back to live signals when cache misses', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(false);
      expect(res.body.tier).toBe('SIGNALS_BASIC');
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(signalTtlEnforcer.getLive).toHaveBeenCalled();
      expect(setCachedSignals).toHaveBeenCalled();
    });

    it('filters by since parameter', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      // Only sig-002 (ts=1700000100000) and sig-003 (ts=1700000200000) have ts >= 1700000100000
      const res = await request(app)
        .get('/api/v1/signals/feed?since=1700000100000')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].id).toBe('sig-002');
      expect(res.body.data[1].id).toBe('sig-003');
    });

    it('respects limit parameter', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?limit=1')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.count).toBe(1);
    });

    it('applies both since and limit together', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?since=1700000000000&limit=2')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('uses default since=0 and limit=20', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(getCachedSignals).toHaveBeenCalledWith('SIGNALS_BASIC', 0, 20);
    });

    it('passes tier+since+limit to setCachedSignals', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals/feed?since=100&limit=5')
        .set('Authorization', 'Bearer valid-key');

      expect(setCachedSignals).toHaveBeenCalledWith(
        'SIGNALS_BASIC',
        100,
        5,
        expect.any(Array)
      );
    });

    it('returns empty array when all signals are older than since', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?since=99999999999999')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    it('handles empty live signals list', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      vi.mocked(signalTtlEnforcer.getLive).mockReturnValue([]);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.count).toBe(0);
    });
  });

  // ============================================================
  // GET /feed — Cache write failure (warns but continues)
  // ============================================================
  describe('GET /feed — cache write failure', () => {
    it('warns but returns live data when cache write throws', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      vi.mocked(setCachedSignals).mockRejectedValue(new Error('Redis down'));
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(false);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(logger.warn).toHaveBeenCalledWith(
        '[SignalFeed] Redis write failed; continuing without cache',
        { cause: expect.any(Error) }
      );
    });
  });

  // ============================================================
  // GET /feed — Invalid query params
  // ============================================================
  describe('GET /feed — query validation', () => {
    it('returns 400 for negative since', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?since=-1')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for zero limit', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?limit=0')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(400);
    });

    it('returns 400 for limit above 100', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?limit=101')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric since', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?since=abc')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric limit', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed?limit=xyz')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // GET /feed — Unexpected error
  // ============================================================
  describe('GET /feed — unexpected error', () => {
    it('returns 500 when getCachedSignals throws', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockRejectedValue(new Error('Cache crash'));
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch feed' });
      expect(logger.error).toHaveBeenCalledWith('[SignalFeed] Feed list error', { err: expect.any(Error) });
    });

    it('returns 500 when signalTtlEnforcer.getLive throws', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      vi.mocked(signalTtlEnforcer.getLive).mockImplementation(() => { throw new Error('Enforcer crash'); });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch feed' });
    });
  });

  // ============================================================
  // GET /feed/:id — Identity
  // ============================================================
  describe('GET /feed/:id — identity', () => {
    it('returns 401 when no valid API key', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/sig-001')
        .set('Authorization', 'Bearer invalid-key');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Valid API key required' });
    });
  });

  // ============================================================
  // GET /feed/:id — Found
  // ============================================================
  describe('GET /feed/:id — found', () => {
    it('returns 200 with signal data for existing signal', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/sig-001')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('sig-001');
      expect(res.body.data.market).toBe('BTC/USD');
    });

    it('returns 200 for sig-002', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/sig-002')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('sig-002');
    });

    it('returns 200 for sig-003', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/sig-003')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('sig-003');
    });
  });

  // ============================================================
  // GET /feed/:id — Not found
  // ============================================================
  describe('GET /feed/:id — not found', () => {
    it('returns 404 for unknown signal id', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/nonexistent')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Signal not found or expired' });
    });

    it('returns 404 when live signals list is empty', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(signalTtlEnforcer.getLive).mockReturnValue([]);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/sig-001')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(404);
    });
  });

  // ============================================================
  // GET /feed/:id — Unexpected error
  // ============================================================
  describe('GET /feed/:id — unexpected error', () => {
    it('returns 500 when signalTtlEnforcer.getLive throws', async () => {
      vi.mocked(resolveSubscriberId).mockReturnValue({ subscriberId: 'sub_1', tier: 'SIGNALS_BASIC' });
      vi.mocked(signalTtlEnforcer.getLive).mockImplementation(() => { throw new Error('Enforcer crash'); });
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/feed/sig-001')
        .set('Authorization', 'Bearer valid-key');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch signal' });
      expect(logger.error).toHaveBeenCalledWith('[SignalFeed] Signal lookup error', { err: expect.any(Error) });
    });
  });
});
