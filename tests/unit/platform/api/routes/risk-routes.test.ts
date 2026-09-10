/**
 * Risk API Routes — Integration Tests
 *
 * Covers src/platform/api/routes/risk-routes.ts:
 *   POST   /var              — VaR/CVaR computation
 *   POST   /correlation      — Correlation matrix
 *   GET    /drawdown         — Drawdown status + alerts
 *   POST   /drawdown/alert   — Trigger drawdown alert check
 *   POST   /atr/stop         — ATR trailing stop computation
 *   GET    /atr/stop/:symbol — Get stored ATR state
 *   DELETE /atr/stop/:symbol — Clear ATR state
 *   POST   /kelly/size       — Kelly position sizing
 *   POST   /kelly/from-history — Kelly from trade history
 *   DELETE /cache            — Invalidate user risk cache
 *
 * RiskEngine is mocked so all route branching (validation, error paths,
 * feature-flag gate) is exercised without real computation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const computeVaRMock = vi.fn();
const computeCorrelationMock = vi.fn();
const getDrawdownStatusMock = vi.fn();
const checkDrawdownAlertsMock = vi.fn();
const computeAtrStopMock = vi.fn();
const getAtrStateMock = vi.fn();
const clearAtrStateMock = vi.fn();
const calculateKellyMock = vi.fn();
const kellyFromTradeHistoryMock = vi.fn();
const invalidateUserCacheMock = vi.fn();

vi.mock('../../../../../src/platform/risk/risk-engine', () => {
  return {
    RiskEngine: class {
      async computeVaR(...args: unknown[]) {
        return computeVaRMock(...args);
      }
      async computeCorrelation(...args: unknown[]) {
        return computeCorrelationMock(...args);
      }
      async getDrawdownStatus(...args: unknown[]) {
        return getDrawdownStatusMock(...args);
      }
      async checkDrawdownAlerts(...args: unknown[]) {
        return checkDrawdownAlertsMock(...args);
      }
      computeAtrStop(...args: unknown[]) {
        return computeAtrStopMock(...args);
      }
      async getAtrState(...args: unknown[]) {
        return getAtrStateMock(...args);
      }
      async clearAtrState(...args: unknown[]) {
        return clearAtrStateMock(...args);
      }
      calculateKelly(...args: unknown[]) {
        return calculateKellyMock(...args);
      }
      async kellyFromTradeHistory(...args: unknown[]) {
        return kellyFromTradeHistoryMock(...args);
      }
      async invalidateUserCache(...args: unknown[]) {
        return invalidateUserCacheMock(...args);
      }
    },
  };
});

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { riskRouter } from '../../../../../src/platform/api/routes/risk-routes';

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(riskRouter);
  return a;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_POSITIONS = [
  {
    symbol: 'BTC/USDT',
    currentValue: 10000,
    side: 'long' as const,
    returns: [0.01, -0.02, 0.015, -0.01, 0.005],
    dailyVolatility: 0.02,
  },
];

const VALID_VAR_REQUEST = {
  positions: VALID_POSITIONS,
  confidence: '0.95' as const,
  horizonDays: 1,
  method: 'both' as const,
};

const MOCK_VAR_RESULT = {
  var: -500,
  cvar: -700,
  confidence: 0.95,
  horizonDays: 1,
  method: 'both',
};

const MOCK_CORRELATION_RESULT = {
  matrix: [[1, 0.5], [0.5, 1]],
  symbols: ['BTC/USDT', 'ETH/USDT'],
};

const MOCK_DRAWDOWN_RESULT = {
  currentDrawdown: 0.05,
  maxDrawdown: 0.15,
  peakValue: 11000,
  currentValue: 10450,
};

const MOCK_ATR_RESULT = {
  stopPrice: 48000,
  atr: 1000,
  direction: 'long',
};

const MOCK_KELLY_RESULT = {
  kellyFraction: 0.25,
  positionSize: 2500,
  expectedGrowthRate: 0.02,
};

describe('risk-routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ENABLE_RISK_ENGINE', 'true');
    // Default happy-path return values
    computeVaRMock.mockResolvedValue(MOCK_VAR_RESULT);
    computeCorrelationMock.mockResolvedValue(MOCK_CORRELATION_RESULT);
    getDrawdownStatusMock.mockResolvedValue(MOCK_DRAWDOWN_RESULT);
    checkDrawdownAlertsMock.mockResolvedValue({ alerts: [] });
    computeAtrStopMock.mockReturnValue(MOCK_ATR_RESULT);
    getAtrStateMock.mockResolvedValue(MOCK_ATR_RESULT);
    clearAtrStateMock.mockResolvedValue(undefined);
    calculateKellyMock.mockReturnValue(MOCK_KELLY_RESULT);
    kellyFromTradeHistoryMock.mockResolvedValue(MOCK_KELLY_RESULT);
    invalidateUserCacheMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── Feature flag gate ─────────────────────────────────────────────────────

  describe('feature flag gate', () => {
    it('returns 503 when ENABLE_RISK_ENGINE is not set', async () => {
      vi.stubEnv('ENABLE_RISK_ENGINE', 'false');
      const res = await request(app()).post('/var').send(VALID_VAR_REQUEST);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Risk engine disabled');
      expect(res.body.flag).toBe('ENABLE_RISK_ENGINE');
    });
  });

  // ── POST /var ─────────────────────────────────────────────────────────────

  describe('POST /var', () => {
    it('returns VaR result for valid input', async () => {
      const res = await request(app()).post('/var').send(VALID_VAR_REQUEST);
      expect(res.status).toBe(200);
      expect(res.body.var).toBe(-500);
      expect(res.body.cvar).toBe(-700);
      expect(computeVaRMock).toHaveBeenCalledOnce();
    });

    it('returns 400 for empty positions array', async () => {
      const res = await request(app()).post('/var').send({ positions: [] });
      expect(res.status).toBe(400);
      expect(computeVaRMock).not.toHaveBeenCalled();
    });

    it('returns 400 for missing positions', async () => {
      const res = await request(app()).post('/var').send({ confidence: '0.95' });
      expect(res.status).toBe(400);
      expect(computeVaRMock).not.toHaveBeenCalled();
    });

    it('returns 500 when computeVaR throws', async () => {
      computeVaRMock.mockRejectedValue(new Error('VaR computation failed'));
      const res = await request(app()).post('/var').send(VALID_VAR_REQUEST);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('VaR computation failed');
    });
  });

  // ── POST /correlation ─────────────────────────────────────────────────────

  describe('POST /correlation', () => {
    const validCorrelationInput = {
      positions: [
        { symbol: 'BTC/USDT', returns: [0.01, -0.02, 0.015] },
        { symbol: 'ETH/USDT', returns: [0.005, -0.01, 0.02] },
      ],
    };

    it('returns correlation matrix for valid input', async () => {
      const res = await request(app()).post('/correlation').send(validCorrelationInput);
      expect(res.status).toBe(200);
      expect(res.body.matrix).toEqual([[1, 0.5], [0.5, 1]]);
      expect(computeCorrelationMock).toHaveBeenCalledOnce();
    });

    it('returns 400 for single position (min 2 required)', async () => {
      const res = await request(app()).post('/correlation').send({
        positions: [{ symbol: 'BTC/USDT', returns: [0.01] }],
      });
      expect(res.status).toBe(400);
      expect(computeCorrelationMock).not.toHaveBeenCalled();
    });

    it('returns 500 when computeCorrelation throws', async () => {
      computeCorrelationMock.mockRejectedValue(new Error('Correlation failed'));
      const res = await request(app()).post('/correlation').send(validCorrelationInput);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Correlation computation failed');
    });
  });

  // ── GET /drawdown ─────────────────────────────────────────────────────────

  describe('GET /drawdown', () => {
    it('returns drawdown status', async () => {
      const res = await request(app()).get('/drawdown');
      expect(res.status).toBe(200);
      expect(res.body.currentDrawdown).toBe(0.05);
      expect(res.body.maxDrawdown).toBe(0.15);
      expect(getDrawdownStatusMock).toHaveBeenCalledOnce();
    });

    it('returns 500 when getDrawdownStatus throws', async () => {
      getDrawdownStatusMock.mockRejectedValue(new Error('Drawdown failed'));
      const res = await request(app()).get('/drawdown');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Drawdown status unavailable');
    });
  });

  // ── POST /drawdown/alert ──────────────────────────────────────────────────

  describe('POST /drawdown/alert', () => {
    it('checks alerts with thresholds', async () => {
      const res = await request(app())
        .post('/drawdown/alert')
        .send({ dailyThreshold: 0.05, totalThreshold: 0.1 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(checkDrawdownAlertsMock).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid threshold values', async () => {
      const res = await request(app())
        .post('/drawdown/alert')
        .send({ dailyThreshold: 1.5 });
      expect(res.status).toBe(400);
      expect(checkDrawdownAlertsMock).not.toHaveBeenCalled();
    });

    it('returns 500 when checkDrawdownAlerts throws', async () => {
      checkDrawdownAlertsMock.mockRejectedValue(new Error('Alert failed'));
      const res = await request(app())
        .post('/drawdown/alert')
        .send({ dailyThreshold: 0.05 });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Drawdown alert check failed');
    });
  });

  // ── POST /atr/stop ────────────────────────────────────────────────────────

  describe('POST /atr/stop', () => {
    const validAtrInput = {
      symbol: 'BTC/USDT',
      candles: Array.from({ length: 15 }, (_, i) => ({
        high: 50000 + i * 100,
        low: 49000 + i * 100,
        close: 49500 + i * 100,
      })),
      direction: 'long' as const,
      period: 14,
      multiplier: 2.0,
    };

    it('returns ATR stop for valid input', async () => {
      const res = await request(app()).post('/atr/stop').send(validAtrInput);
      expect(res.status).toBe(200);
      expect(res.body.stopPrice).toBe(48000);
      expect(computeAtrStopMock).toHaveBeenCalledOnce();
    });

    it('returns 400 for fewer than 15 candles', async () => {
      const res = await request(app()).post('/atr/stop').send({
        ...validAtrInput,
        candles: [{ high: 50000, low: 49000, close: 49500 }],
      });
      expect(res.status).toBe(400);
      expect(computeAtrStopMock).not.toHaveBeenCalled();
    });

    it('returns 500 when computeAtrStop throws', async () => {
      computeAtrStopMock.mockImplementation(() => {
        throw new Error('ATR failed');
      });
      const res = await request(app()).post('/atr/stop').send(validAtrInput);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('ATR stop computation failed');
    });
  });

  // ── GET /atr/stop/:symbol ─────────────────────────────────────────────────

  describe('GET /atr/stop/:symbol', () => {
    it('returns ATR state for a symbol', async () => {
      const res = await request(app()).get('/atr/stop/BTC-USDT');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stopPrice).toBe(48000);
      expect(getAtrStateMock).toHaveBeenCalledOnce();
    });

    it('returns 404 when no ATR state found', async () => {
      getAtrStateMock.mockResolvedValue(null);
      const res = await request(app()).get('/atr/stop/UNKNOWN');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No ATR state found for this symbol');
    });

    it('returns 500 when getAtrState throws', async () => {
      getAtrStateMock.mockRejectedValue(new Error('Fetch failed'));
      const res = await request(app()).get('/atr/stop/BTC-USDT');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch ATR state');
    });
  });

  // ── DELETE /atr/stop/:symbol ──────────────────────────────────────────────

  describe('DELETE /atr/stop/:symbol', () => {
    it('clears ATR state for a symbol', async () => {
      const res = await request(app()).delete('/atr/stop/BTC-USDT');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('ATR state cleared for BTC-USDT');
      expect(clearAtrStateMock).toHaveBeenCalledOnce();
    });

    it('returns 500 when clearAtrState throws', async () => {
      clearAtrStateMock.mockRejectedValue(new Error('Clear failed'));
      const res = await request(app()).delete('/atr/stop/BTC-USDT');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to clear ATR state');
    });
  });

  // ── POST /kelly/size ──────────────────────────────────────────────────────

  describe('POST /kelly/size', () => {
    const validKellyInput = {
      winProbability: 0.55,
      winLossRatio: 1.5,
      portfolioValue: 10000,
      correlation: 0,
      currentExposure: 0,
      kellyFraction: 0.25,
    };

    it('returns Kelly position size for valid input', async () => {
      const res = await request(app()).post('/kelly/size').send(validKellyInput);
      expect(res.status).toBe(200);
      expect(res.body.kellyFraction).toBe(0.25);
      expect(res.body.positionSize).toBe(2500);
      expect(calculateKellyMock).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid winProbability', async () => {
      const res = await request(app())
        .post('/kelly/size')
        .send({ ...validKellyInput, winProbability: 1.5 });
      expect(res.status).toBe(400);
      expect(calculateKellyMock).not.toHaveBeenCalled();
    });

    it('returns 500 when calculateKelly throws', async () => {
      calculateKellyMock.mockImplementation(() => {
        throw new Error('Kelly failed');
      });
      const res = await request(app()).post('/kelly/size').send(validKellyInput);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Kelly sizing computation failed');
    });
  });

  // ── POST /kelly/from-history ──────────────────────────────────────────────

  describe('POST /kelly/from-history', () => {
    const validHistoryInput = {
      tradeReturns: [0.01, -0.02, 0.015, -0.01, 0.005],
      portfolioValue: 10000,
      correlation: 0,
      kellyFraction: 0.25,
    };

    it('returns Kelly result from trade history', async () => {
      const res = await request(app())
        .post('/kelly/from-history')
        .send(validHistoryInput);
      expect(res.status).toBe(200);
      expect(res.body.kellyFraction).toBe(0.25);
      expect(kellyFromTradeHistoryMock).toHaveBeenCalledOnce();
    });

    it('returns 400 for empty tradeReturns', async () => {
      const res = await request(app())
        .post('/kelly/from-history')
        .send({ ...validHistoryInput, tradeReturns: [] });
      expect(res.status).toBe(400);
      expect(kellyFromTradeHistoryMock).not.toHaveBeenCalled();
    });

    it('returns 500 when kellyFromTradeHistory throws', async () => {
      kellyFromTradeHistoryMock.mockRejectedValue(new Error('History failed'));
      const res = await request(app())
        .post('/kelly/from-history')
        .send(validHistoryInput);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Kelly from history failed');
    });
  });

  // ── DELETE /cache ─────────────────────────────────────────────────────────

  describe('DELETE /cache', () => {
    it('invalidates user cache', async () => {
      const res = await request(app()).delete('/cache');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Risk cache invalidated');
      expect(invalidateUserCacheMock).toHaveBeenCalledOnce();
    });

    it('returns 500 when invalidateUserCache throws', async () => {
      invalidateUserCacheMock.mockRejectedValue(new Error('Cache failed'));
      const res = await request(app()).delete('/cache');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Cache invalidation failed');
    });
  });
});