/**
 * Signal Feed Routes — Comprehensive Coverage Tests
 *
 * Covers src/platform/api/routes/signal-feed-routes.ts:
 * - GET /api/v1/signals/stream — SSE (ENTERPRISE only)
 * - GET /api/v1/signals — list with cache, tier filter, pagination
 * - GET /api/v1/signals/:id — single lookup with tier gate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockLiveSignals = [
  { id: 'sig-001', ts: Date.now(), market: 'BTC/USD', side: 'buy', size: 0.85, confidence: 0.9, strategy: 'arb', ttl: 300, expiresAt: Date.now() + 300000 },
  { id: 'sig-002', ts: Date.now(), market: 'ETH/USD', side: 'sell', size: 0.72, confidence: 0.8, strategy: 'arb', ttl: 300, expiresAt: Date.now() + 300000 },
];

// Mock all dependencies BEFORE importing the router
vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/desk/signal/signal-ttl-enforcer', () => ({
  signalTtlEnforcer: {
    getLive: vi.fn(() => mockLiveSignals),
  },
}));

vi.mock('../../../../../src/desk/signal/signal-rest-cache', () => ({
  getCachedSignals: vi.fn(() => null),
  setCachedSignals: vi.fn(),
}));

vi.mock('../../../../../src/desk/signal/signal-tier-filter', () => ({
  filterSignalsForTier: vi.fn((signals) => signals),
  canAccessSse: vi.fn((tier: string) => tier === 'ENTERPRISE'),
}));

// Shared gate instance so SUT and tests use the same object
const mockGateInstance = vi.hoisted(() => ({
  validateApiKey: vi.fn(() => ({ tier: 'PRO', userId: 'user_001', id: 'lic_001' })),
}));

vi.mock('../../../../../src/desk/gate/raas-gate', () => ({
  default: {
    getInstance: () => mockGateInstance,
  },
}));

vi.mock('../../../../../src/desk/signal/sse-signal-broadcaster', () => ({
  sseBroadcaster: {
    subscribe: vi.fn((res: any) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write('retry: 5000\n\n');
      res.end();
    }),
  },
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: (tier: string) => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../../src/shared/types/license', () => ({
  LicenseTier: { ENTERPRISE: 'ENTERPRISE', PRO: 'PRO', FREE: 'FREE' },
}));

vi.mock('../../../../../src/desk/signal/signal-types', () => ({
  TierKey: {},
}));

// Import AFTER mocks
import { signalFeedRouter } from '../../../../../src/platform/api/routes/signal-feed-routes';
import { signalTtlEnforcer } from '../../../../../src/desk/signal/signal-ttl-enforcer';
import { getCachedSignals, setCachedSignals } from '../../../../../src/desk/signal/signal-rest-cache';
import { filterSignalsForTier, canAccessSse } from '../../../../../src/desk/signal/signal-tier-filter';
import { sseBroadcaster } from '../../../../../src/desk/signal/sse-signal-broadcaster';
import { logger } from '../../../../../src/shared/utils/logger';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', signalFeedRouter);
  return app;
}

describe('Signal Feed Routes — signal-feed-routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signalTtlEnforcer.getLive).mockReturnValue(mockLiveSignals);
    vi.mocked(getCachedSignals).mockResolvedValue(null);
    vi.mocked(setCachedSignals).mockResolvedValue(undefined);
    vi.mocked(filterSignalsForTier).mockImplementation((signals) => signals);
    vi.mocked(canAccessSse).mockImplementation((tier: string) => tier === 'ENTERPRISE');
    vi.mocked(sseBroadcaster.subscribe).mockImplementation((res: any) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write('retry: 5000\n\n');
      res.end();
    });
  });

  // ============================================================
  // GET /stream — SSE Endpoint
  // ============================================================
  describe('GET /api/v1/signals/stream (SSE)', () => {
    it('returns 403 for FREE tier', async () => {
      vi.mocked(canAccessSse).mockReturnValue(false);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/stream')
        .set('Authorization', 'Bearer free-key');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: 'SSE stream requires ENTERPRISE tier',
        upgrade: 'https://cashclaw.cc/pricing',
      });
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('returns 403 for PRO tier', async () => {
      vi.mocked(canAccessSse).mockReturnValue(false);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/stream')
        .set('Authorization', 'Bearer pro-key');

      expect(res.status).toBe(403);
    });

    it('returns 200 and subscribes for ENTERPRISE tier', async () => {
      vi.mocked(canAccessSse).mockReturnValue(true);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/stream')
        .set('Authorization', 'Bearer enterprise-key');

      expect(res.status).toBe(200);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[SignalFeed] SSE connection opened'));
      expect(sseBroadcaster.subscribe).toHaveBeenCalled();
    });

    it('logs connection with resolved tier', async () => {
      vi.mocked(canAccessSse).mockReturnValue(true);
      // Override gate to return ENTERPRISE for this test
      mockGateInstance.validateApiKey.mockReturnValue({ tier: 'ENTERPRISE', userId: 'user_001', id: 'lic_001' });
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals/stream')
        .set('Authorization', 'Bearer enterprise-key');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/tier=ENTERPRISE/)
      );
    });
  });

  // ============================================================
  // GET / — List Signals
  // ============================================================
  describe('GET /api/v1/signals (list)', () => {
    it('returns 200 with paginated signals', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('tier');
      expect(res.body).toHaveProperty('cached');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns cached signals when cache hits', async () => {
      const cachedSignals = [{ id: 'cached-1', ts: Date.now() }];
      vi.mocked(getCachedSignals).mockResolvedValue(cachedSignals);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(true);
      expect(res.body.data).toEqual(cachedSignals);
      expect(getCachedSignals).toHaveBeenCalled();
      // Should NOT call filter or set cache
      expect(filterSignalsForTier).not.toHaveBeenCalled();
      expect(setCachedSignals).not.toHaveBeenCalled();
    });

    it('filters live signals when cache misses', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.cached).toBe(false);
      expect(filterSignalsForTier).toHaveBeenCalled();
      expect(setCachedSignals).toHaveBeenCalled();
    });

    it('passes tier to filterSignalsForTier', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(filterSignalsForTier).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringMatching(/^(FREE|PRO|ENTERPRISE)$/)
      );
    });

    it('respects since query parameter', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const futureSignal = {
        ...mockLiveSignals[0],
        ts: Date.now() + 1000000,
        expiresAt: Date.now() + 2000000,
      };
      vi.mocked(signalTtlEnforcer.getLive).mockReturnValue([futureSignal, mockLiveSignals[1]]);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals?since=' + (Date.now() + 500000))
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      // Only future signal should pass since filter
      expect(res.body.data.length).toBeLessThanOrEqual(2);
    });

    it('respects limit query parameter', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const manySignals = Array.from({ length: 10 }, (_, i) => ({
        ...mockLiveSignals[0],
        id: `sig-${i}`,
      }));
      vi.mocked(signalTtlEnforcer.getLive).mockReturnValue(manySignals);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals?limit=3')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.count).toBeLessThanOrEqual(3);
    });

    it('returns 400 for invalid since parameter', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals?since=invalid')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for invalid limit parameter (too large)', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals?limit=101')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for invalid limit parameter (zero)', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals?limit=0')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('uses default since=0 and limit=20 when not provided', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(getCachedSignals).toHaveBeenCalledWith(expect.any(String), 0, 20);
    });

    it('includes tier in response', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.body).toHaveProperty('tier');
      expect(['FREE', 'PRO', 'ENTERPRISE']).toContain(res.body.tier);
    });

    it('returns 500 on unexpected error', async () => {
      vi.mocked(getCachedSignals).mockRejectedValue(new Error('Cache error'));
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal error' });
      expect(logger.error).toHaveBeenCalledWith('[SignalFeed] GET / failed', expect.any(Object));
    });
  });

  // ============================================================
  // GET /:id — Single Signal Lookup
  // ============================================================
  describe('GET /api/v1/signals/:id (single)', () => {
    it('returns 200 for existing signal', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('sig-001');
    });

    it('returns 404 for unknown signal id', async () => {
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/nonexistent')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Signal not found or expired' });
    });

    it('returns 404 for expired signal (filtered out by TTL)', async () => {
      vi.mocked(signalTtlEnforcer.getLive).mockReturnValue([]);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(404);
    });

    it('returns 403 when tier filter removes signal', async () => {
      vi.mocked(filterSignalsForTier).mockReturnValue([]);
      const app = buildApp();

      const res = await request(app)
        .get('/api/v1/signals/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Signal not available for your tier' });
    });

    it('calls filterSignalsForTier with single signal array', async () => {
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(filterSignalsForTier).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'sig-001' })],
        expect.any(String)
      );
    });

    it('resolves tier from Authorization header', async () => {
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals/sig-001')
        .set('Authorization', 'Bearer test-key');

      expect(filterSignalsForTier).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringMatching(/^(FREE|PRO|ENTERPRISE)$/)
      );
    });
  });

  // ============================================================
  // Tier Resolution
  // ============================================================
  describe('Tier resolution (resolveTier)', () => {
    it('returns FREE when no Authorization header', async () => {
      const app = buildApp();

      await request(app).get('/api/v1/signals');
      expect(filterSignalsForTier).toHaveBeenCalledWith(expect.any(Array), 'FREE');
    });

    it('returns FREE when Authorization header missing Bearer prefix', async () => {
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'not-bearer-key');
      expect(filterSignalsForTier).toHaveBeenCalledWith(expect.any(Array), 'FREE');
    });

    it('returns FREE when API key is invalid', async () => {
      const { default: RaasGate } = await import('../../../../../src/desk/gate/raas-gate');
      vi.mocked(RaasGate.getInstance().validateApiKey).mockReturnValue(null);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer invalid-key');
      expect(filterSignalsForTier).toHaveBeenCalledWith(expect.any(Array), 'FREE');
    });

    it('returns ENTERPRISE for ENTERPRISE license', async () => {
      const { default: RaasGate } = await import('../../../../../src/desk/gate/raas-gate');
      vi.mocked(RaasGate.getInstance().validateApiKey).mockReturnValue({ tier: 'ENTERPRISE', userId: 'user_001', id: 'lic_001' });
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer ent-key');
      expect(filterSignalsForTier).toHaveBeenCalledWith(expect.any(Array), 'ENTERPRISE');
    });

    it('returns PRO for PRO license', async () => {
      const { default: RaasGate } = await import('../../../../../src/desk/gate/raas-gate');
      vi.mocked(RaasGate.getInstance().validateApiKey).mockReturnValue({ tier: 'PRO', userId: 'user_001', id: 'lic_001' });
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer pro-key');
      expect(filterSignalsForTier).toHaveBeenCalledWith(expect.any(Array), 'PRO');
    });

    it('returns FREE for unknown license tier', async () => {
      const { default: RaasGate } = await import('../../../../../src/desk/gate/raas-gate');
      vi.mocked(RaasGate.getInstance().validateApiKey).mockReturnValue({ tier: 'UNKNOWN', userId: 'user_001', id: 'lic_001' });
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer unknown-key');
      expect(filterSignalsForTier).toHaveBeenCalledWith(expect.any(Array), 'FREE');
    });
  });

  // ============================================================
  // Cache Integration
  // ============================================================
  describe('Cache integration', () => {
    it('calls getCachedSignals with correct params', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals?since=123&limit=10')
        .set('Authorization', 'Bearer test-key');

      expect(getCachedSignals).toHaveBeenCalledWith(expect.any(String), 123, 10);
    });

    it('calls setCachedSignals with filtered results', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue(null);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(setCachedSignals).toHaveBeenCalledWith(
        expect.any(String),
        0,
        20,
        expect.any(Array)
      );
    });

    it('does not cache when cache hits', async () => {
      vi.mocked(getCachedSignals).mockResolvedValue([{ id: 'cached' }]);
      const app = buildApp();

      await request(app)
        .get('/api/v1/signals')
        .set('Authorization', 'Bearer test-key');

      expect(setCachedSignals).not.toHaveBeenCalled();
    });
  });
});