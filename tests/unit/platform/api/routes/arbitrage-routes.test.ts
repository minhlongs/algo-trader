/**
 * Arbitrage API Routes — Integration Tests
 *
 * Covers the five routes on the exported arbitrageRoutes:
 * POST /execute, GET /metrics, GET /status, POST /start, POST /stop
 * The orchestrator is mocked so the routes' branching (lazy init, validation, error paths)
 * is exercised without connecting to real feeds/exchanges.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const startMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const stopMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getMetricsMock = vi.hoisted(() => vi.fn());

const orchestratorInstance = {
  start: startMock,
  stop: stopMock,
  getMetrics: getMetricsMock,
};

const createOrchestratorMock = vi.hoisted(() => vi.fn(() => orchestratorInstance));

vi.mock('../../../../../src/desk/arbitrage/orchestrator', () => ({
  StrategyOrchestrator: class {
    start = orchestratorInstance.start;
    stop = orchestratorInstance.stop;
    getMetrics = orchestratorInstance.getMetrics;
  },
  createStrategyOrchestrator: createOrchestratorMock,
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { arbitrageRoutes } from '../../../../../src/platform/api/routes/arbitrage';

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(arbitrageRoutes);
  return a;
}

const VALID_OPPORTUNITY = {
  id: 'opp-1',
  type: 'cross-exchange' as const,
  legs: [
    { exchange: 'binance' as const, symbol: 'BTC/USDT', side: 'buy' as const, price: 50000, amount: 0.1, fee: 5 },
    { exchange: 'okx' as const, symbol: 'BTC/USDT', side: 'sell' as const, price: 50100, amount: 0.1, fee: 5 },
  ],
  expectedProfit: 10,
  expectedProfitPct: 0.02,
  totalFees: 10,
  confidence: 0.9,
  detectedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};

const MOCK_METRICS = {
  feedConnected: true,
  feedLatencyMs: 5,
  messagesReceived: 100,
  scansPerformed: 50,
  opportunitiesDetected: 5,
  p95DetectionLatencyMs: 10,
  signalsScored: 5,
  actionableSignals: 3,
  executionsAttempted: 2,
  executionsSucceeded: 2,
  executionsFailed: 0,
  totalProfit: 20,
  p95ExecutionLatencyMs: 50,
  queueSize: 0,
  queueDropped: 0,
  uptimeMs: 60000,
  isRunning: true,
};

describe('arbitrageRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orchestratorInstance.getMetrics.mockReturnValue(MOCK_METRICS);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /execute', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app()).post('/execute').send({ id: 'opp-1' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('missing required fields');
    });

    it('queues a valid opportunity and returns 202', async () => {
      const res = await request(app()).post('/execute').send(VALID_OPPORTUNITY);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.opportunityId).toBe('opp-1');
      expect(res.body.status).toBe('queued');
      expect(res.body.queueDepth).toBe(0);
    });

    it('returns 500 when orchestrator initialization throws', async () => {
      // Simulate lazy-init failure by making getMetrics throw
      orchestratorInstance.getMetrics.mockImplementation(() => {
        throw new Error('init failed');
      });

      const res = await request(app()).post('/execute').send(VALID_OPPORTUNITY);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('init failed');
    });
  });

  describe('GET /metrics', () => {
    it('returns orchestrator metrics with timestamp', async () => {
      const res = await request(app()).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.body.feedConnected).toBe(true);
      expect(res.body.scansPerformed).toBe(50);
      expect(res.body.opportunitiesDetected).toBe(5);
      expect(res.body.timestamp).toBeDefined();
      expect(typeof res.body.timestamp).toBe('number');
      expect(orchestratorInstance.getMetrics).toHaveBeenCalledOnce();
    });

    it('returns 500 when orchestrator throws', async () => {
      orchestratorInstance.getMetrics.mockImplementation(() => {
        throw new Error('metrics failed');
      });

      const res = await request(app()).get('/metrics');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('metrics failed');
    });
  });

  describe('GET /status', () => {
    it('returns orchestrator status subset with timestamp', async () => {
      const res = await request(app()).get('/status');

      expect(res.status).toBe(200);
      expect(res.body.isRunning).toBe(true);
      expect(res.body.feedConnected).toBe(true);
      expect(res.body.uptimeMs).toBe(60000);
      expect(res.body.queueSize).toBe(0);
      expect(res.body.queueDropped).toBe(0);
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns 500 when orchestrator throws', async () => {
      orchestratorInstance.getMetrics.mockImplementation(() => {
        throw new Error('status failed');
      });

      const res = await request(app()).get('/status');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('status failed');
    });
  });

  describe('POST /start', () => {
    it('starts orchestrator and returns success', async () => {
      orchestratorInstance.getMetrics.mockReturnValue({ ...MOCK_METRICS, isRunning: false });

      const res = await request(app()).post('/start');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Orchestrator started');
      expect(orchestratorInstance.start).toHaveBeenCalledOnce();
    });

    it('does not call start if already running', async () => {
      orchestratorInstance.getMetrics.mockReturnValue({ ...MOCK_METRICS, isRunning: true });

      const res = await request(app()).post('/start');

      expect(res.status).toBe(200);
      expect(orchestratorInstance.start).not.toHaveBeenCalled();
    });

    it('returns 500 when start throws', async () => {
      orchestratorInstance.start.mockRejectedValue(new Error('start failed'));
      orchestratorInstance.getMetrics.mockReturnValue({ ...MOCK_METRICS, isRunning: false });

      const res = await request(app()).post('/start');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('start failed');
      orchestratorInstance.start.mockReset();
    });
  });

  describe('POST /stop', () => {
    it('returns 500 when stop throws', async () => {
      orchestratorInstance.stop.mockRejectedValue(new Error('stop failed'));

      const res = await request(app()).post('/stop');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('stop failed');
      orchestratorInstance.stop.mockReset();
    });

    it('stops orchestrator and resets singleton, returns success', async () => {
      const res = await request(app()).post('/stop');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Orchestrator stopped');
      expect(orchestratorInstance.stop).toHaveBeenCalledOnce();
    });

    it('returns success even when orchestrator is null (idempotent)', async () => {
      // After first stop, the internal state is null — second stop should still succeed
      await request(app()).post('/stop');
      const res = await request(app()).post('/stop');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});