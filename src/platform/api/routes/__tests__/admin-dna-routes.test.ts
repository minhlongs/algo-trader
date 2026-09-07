/**
 * Admin DNA Routes — Integration Tests
 *
 * Tests: GET /status, POST /start, POST /stop, POST /reset, POST /config
 * Plus: auth failures, error catch blocks, provider/engine 503s, TF signals.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  mockEngine: {
    isRunning: false,
    paperMode: true,
    getLastConsensus: () => null,
    setPaperMode: () => {},
  },
  mockRequireAdminKey: vi.fn(() => true),
}));

vi.mock('../../../../desk/strategies/dna/orchestrator', () => ({
  startDnaEngine: vi.fn(() => mocks.mockEngine),
  stopDnaEngine: vi.fn(),
  getDnaEngine: vi.fn(() => mocks.mockEngine),
  resetDnaEngine: vi.fn(),
}));

vi.mock('../../../../desk/strategies/dna/dna-state-store', () => ({
  InMemoryStateStore: vi.fn(),
}));

vi.mock('../../middleware/require-admin-key', () => ({
  requireAdminKey: (req: any, res: any) => {
    if (mocks.mockRequireAdminKey(req, res)) return true;
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createAdminDnaRouter, setDnaProvider, setDnaConfig, resetDnaProvider } from '../admin-dna-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  setDnaProvider({ getCandles: vi.fn() } as any);
  app.use('/api/v1/admin/dna', createAdminDnaRouter());
  return app;
}

describe('Admin DNA Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /status', () => {
    it('returns 200 with engine state', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('running');
      expect(res.body).toHaveProperty('paperMode');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /start', () => {
    it('returns 200 with started status', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/admin/dna/start')
        .send({ paperMode: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('started');
    });
  });

  describe('POST /stop', () => {
    it('returns 200 with stopped status', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/stop');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stopped');
    });
  });

  describe('POST /reset', () => {
    it('returns 200 with reset status', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/reset');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('reset');
    });
  });

  describe('POST /config', () => {
    it('returns 200 with updated config', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/admin/dna/config')
        .send({ paperMode: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('updated');
    });
  });

  // ── Auth failures — requireAdminKey returns false (lines 40, 77, 101, 116, 132) ──

  describe('auth failures', () => {
    it('GET /status returns early when admin key missing', async () => {
      mocks.mockRequireAdminKey.mockReturnValue(false);
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');
      // requireAdminKey sends 401 itself; router returns early
      expect(res.status).toBe(401);
      mocks.mockRequireAdminKey.mockReturnValue(true);
    });

    it('POST /start returns early when admin key missing', async () => {
      mocks.mockRequireAdminKey.mockReturnValue(false);
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/start').send({});
      expect(res.status).toBe(401);
      mocks.mockRequireAdminKey.mockReturnValue(true);
    });

    it('POST /stop returns early when admin key missing', async () => {
      mocks.mockRequireAdminKey.mockReturnValue(false);
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/stop');
      expect(res.status).toBe(401);
      mocks.mockRequireAdminKey.mockReturnValue(true);
    });

    it('POST /reset returns early when admin key missing', async () => {
      mocks.mockRequireAdminKey.mockReturnValue(false);
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/reset');
      expect(res.status).toBe(401);
      mocks.mockRequireAdminKey.mockReturnValue(true);
    });

    it('POST /config returns early when admin key missing', async () => {
      mocks.mockRequireAdminKey.mockReturnValue(false);
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/config').send({});
      expect(res.status).toBe(401);
      mocks.mockRequireAdminKey.mockReturnValue(true);
    });
  });

  // ── GET /status — TF signals mapping + consensus (lines 43-61) ────────────

  describe('GET /status with full engine state', () => {
    it('maps _lastTfSignals into lastTfSignals array (line 45)', async () => {
      const engineWithTf = {
        isRunning: true,
        paperMode: false,
        getLastConsensus: () => null,
        setPaperMode: () => {},
        _lastTfSignals: new Map<string, { action: string; confidence: number }>([
          ['1h', { action: 'buy', confidence: 0.7 }],
          ['4h', { action: 'sell', confidence: 0.4 }],
        ]),
      };
      const { getDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(getDnaEngine).mockReturnValue(engineWithTf as any);

      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');
      expect(res.status).toBe(200);
      expect(res.body.lastTfSignals).toEqual([
        { tf: '1h', action: 'buy', confidence: 0.7 },
        { tf: '4h', action: 'sell', confidence: 0.4 },
      ]);
      expect(res.body.running).toBe(true);
      expect(res.body.paperMode).toBe(false);
    });

    it('renders lastConsensus fields when present (line 50)', async () => {
      const engineWithConsensus = {
        isRunning: true,
        paperMode: true,
        getLastConsensus: () => ({
          traceId: 'abc-123',
          action: 'buy',
          confidence: 0.85,
          weightedBullScore: 3.2,
          weightedBearScore: 1.1,
          reason: 'strong trend',
        }),
        setPaperMode: () => {},
      };
      const { getDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(getDnaEngine).mockReturnValue(engineWithConsensus as any);

      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');
      expect(res.status).toBe(200);
      expect(res.body.lastConsensus).toEqual({
        traceId: 'abc-123',
        action: 'buy',
        confidence: 0.85,
        weightedBullScore: 3.2,
        weightedBearScore: 1.1,
        reason: 'strong trend',
      });
    });

    it('includes _lastConfig from setDnaConfig (line 29, 62)', async () => {
      setDnaConfig({ paperMode: false } as any);
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');
      expect(res.status).toBe(200);
      expect(res.body.config).toMatchObject({ paperMode: false });
    });

    it('defaults running/paperMode when engine is null (line 49-50)', async () => {
      const { getDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(getDnaEngine).mockReturnValue(null as any);
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');
      expect(res.status).toBe(200);
      expect(res.body.running).toBe(false);   // engine?.isRunning ?? false
      expect(res.body.paperMode).toBe(true);   // engine?.paperMode ?? true
      expect(res.body.lastConsensus).toBeNull();
    });
  });

  // ── Error catch blocks — 500 paths (lines 65-68, 90-93, 105-108, 120-123, 142-145) ──

  describe('error catch blocks', () => {
    it('GET /status returns 500 when getDnaEngine throws (line 65)', async () => {
      const { getDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(getDnaEngine).mockImplementation(() => { throw new Error('boom'); });
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to read DNA engine status');
    });

    it('POST /start returns 500 when startDnaEngine throws (line 90)', async () => {
      const { startDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(startDnaEngine).mockImplementation(() => { throw new Error('boom'); });
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/start').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to start DNA engine');
    });

    it('POST /stop returns 500 when stopDnaEngine throws (line 105)', async () => {
      const { stopDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(stopDnaEngine).mockImplementation(() => { throw new Error('boom'); });
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/stop');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to stop DNA engine');
    });

    it('POST /reset returns 500 when resetDnaEngine throws (line 120)', async () => {
      const { resetDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(resetDnaEngine).mockImplementation(() => { throw new Error('boom'); });
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/reset');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to reset DNA engine');
    });

    it('POST /config returns 500 when engine throws (line 142)', async () => {
      const { getDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(getDnaEngine).mockImplementation(() => { throw new Error('boom'); });
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/config').send({});
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to update DNA config');
    });
  });

  // ── 503 paths — provider not configured / engine not running ──────────────

  describe('503 service unavailable', () => {
    it('POST /start returns 503 when provider not configured (line 80)', async () => {
      // Reset module-level provider so the 503 branch triggers
      resetDnaProvider();
      const app = express();
      app.use(express.json());
      app.use('/api/v1/admin/dna', createAdminDnaRouter());
      const res = await request(app).post('/api/v1/admin/dna/start').send({});
      expect(res.status).toBe(503);
      expect(res.body.error).toContain('DnaProvider not configured');
      // Restore for subsequent tests
      setDnaProvider({ getCandles: vi.fn() } as any);
    });

    it('POST /config returns 503 when engine not running (line 135)', async () => {
      const { getDnaEngine } = await import('../../../../desk/strategies/dna/orchestrator');
      vi.mocked(getDnaEngine).mockReturnValue(null as any);
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/config').send({});
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('DNA engine not running');
    });
  });
});
