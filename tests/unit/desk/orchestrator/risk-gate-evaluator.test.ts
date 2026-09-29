import { describe, it, expect } from 'vitest';
import {
  evaluateOrderRisk,
  type EvaluatorParams,
} from '../../../../src/desk/orchestrator/risk-gate-evaluator';
import type { UnifiedTradeIntent } from '../../../../src/desk/orchestrator/orchestrator-types';

describe('evaluateOrderRisk Pre-Trade Risk Gates', () => {
  const baseParams: EvaluatorParams = {
    currentTier: 'NORMAL',
    currentNav: 100000,
    currentCash: 50000,
    minCashBufferRatio: 0.20,
    maxGrossLeverage: 3.0,
    maxSingleVenueConcentration: 0.60,
    engineBudget: 30000,
    committed: 5000,
    venuePositions: {
      binance: 10000,
      bybit: 5000,
    },
  };

  const makeIntent = (qty: number, isRiskReducing = false, venue = 'binance'): UnifiedTradeIntent => ({
    intentId: 'intent-risk-test',
    engineId: 'arbitrage',
    symbol: 'BTC/USDT',
    venue: venue as never,
    side: 'BUY',
    quantity: qty,
    price: 50000,
    urgency: 'MEDIUM',
    expectedEdgeBps: 25,
    expectedSharpe: 2.0,
    timeToExpiryMs: 1000,
    expiresAt: Date.now() + 1000,
    orderType: 'LIMIT',
    isRiskReducing,
  });

  describe('Circuit Breaker Tier Gate', () => {
    it('rejects all orders under HALT and HARD_STOP circuit breaker tiers', () => {
      const haltRes = evaluateOrderRisk(makeIntent(0.1), 50000, {
        ...baseParams,
        currentTier: 'HALT',
      });
      expect(haltRes.approved).toBe(false);
      expect(haltRes.reason).toContain('HALT circuit breaker');
      expect(haltRes.postCashRatio).toBe(0.5);

      const hardStopRes = evaluateOrderRisk(makeIntent(0.1), 50000, {
        ...baseParams,
        currentTier: 'HARD_STOP',
        currentNav: 0,
      });
      expect(hardStopRes.approved).toBe(false);
      expect(hardStopRes.reason).toContain('HARD_STOP circuit breaker');
      expect(hardStopRes.postCashRatio).toBe(0);
    });

    it('rejects speculative orders under ALERT or REDUCE tiers', () => {
      const alertSpec = evaluateOrderRisk(makeIntent(0.1, false), 50000, {
        ...baseParams,
        currentTier: 'ALERT',
      });
      expect(alertSpec.approved).toBe(false);
      expect(alertSpec.reason).toContain('Order expansion rejected in ALERT tier');

      const reduceSpec = evaluateOrderRisk(makeIntent(0.1, false), 50000, {
        ...baseParams,
        currentTier: 'REDUCE',
      });
      expect(reduceSpec.approved).toBe(false);
      expect(reduceSpec.reason).toContain('Order expansion rejected in REDUCE tier');
    });

    it('scales risk-reducing orders under ALERT (0.75x) and REDUCE (0.50x)', () => {
      const alertRiskRed = evaluateOrderRisk(makeIntent(1.0, true), 50000, {
        ...baseParams,
        currentCash: 100000,
        currentTier: 'ALERT',
        engineBudget: 100000,
        maxSingleVenueConcentration: 1.0,
      });
      expect(alertRiskRed.approved).toBe(true);
      expect(alertRiskRed.scaledQty).toBe(0.75);

      const reduceRiskRed = evaluateOrderRisk(makeIntent(1.0, true), 50000, {
        ...baseParams,
        currentCash: 100000,
        currentTier: 'REDUCE',
        engineBudget: 100000,
        maxSingleVenueConcentration: 1.0,
      });
      expect(reduceRiskRed.approved).toBe(true);
      expect(reduceRiskRed.scaledQty).toBe(0.50);
    });
  });

  describe('Capital Budgeting & Liquid Cash Buffer', () => {
    it('rejects when order notional exceeds remaining engine budget', () => {
      const res = evaluateOrderRisk(makeIntent(1.0), 50000, {
        ...baseParams,
        engineBudget: 30000,
        committed: 20000,
      });
      // 1.0 * 50000 = 50000. 20000 + 50000 = 70000 > 30000
      expect(res.approved).toBe(false);
      expect(res.reason).toContain('exceeds remaining engine budget');
    });

    it('rejects when post-order cash breaches minimum liquid buffer ratio (e.g. 20% NAV)', () => {
      const res = evaluateOrderRisk(makeIntent(0.8), 50000, {
        ...baseParams,
        currentNav: 100000,
        currentCash: 45000,
        minCashBufferRatio: 0.20,
        engineBudget: 100000,
      });
      // Notional = 40000. Post cash = 45000 - 40000 = 5000. 5000 / 100000 = 5% < 20%
      expect(res.approved).toBe(false);
      expect(res.reason).toContain('violates minimum 20% liquid cash buffer');
    });
  });

  describe('Gross Leverage & Single Venue Concentration', () => {
    it('rejects when post-order gross leverage exceeds maximum leverage ceiling', () => {
      const res = evaluateOrderRisk(makeIntent(4.0), 50000, {
        ...baseParams,
        currentNav: 100000,
        currentCash: 300000,
        maxGrossLeverage: 2.0,
        engineBudget: 500000,
        venuePositions: { binance: 100000 },
      });
      // Notional = 200000. Current gross = 100000. Post gross = 300000. Gross lev = 3.0x > 2.0x
      expect(res.approved).toBe(false);
      expect(res.reason).toContain('exceeds maximum ceiling 2.0x');
    });

    it('rejects when single venue concentration exceeds threshold for large portfolios', () => {
      const res = evaluateOrderRisk(makeIntent(1.0, false, 'binance'), 50000, {
        ...baseParams,
        currentNav: 100000,
        currentCash: 80000,
        maxGrossLeverage: 4.0,
        maxSingleVenueConcentration: 0.60,
        engineBudget: 100000,
        venuePositions: {
          binance: 35000,
          bybit: 5000,
        },
      });
      // Current gross = 40000. Order notional = 50000. Post gross = 90000 (> 50% NAV = 50000).
      // Post binance = 35000 + 50000 = 85000. Ratio = 85000 / 90000 = 94.4% > 60%
      expect(res.approved).toBe(false);
      expect(res.reason).toContain('concentration 94.4% exceeds cap 60%');
    });

    it('approves orders that satisfy all risk constraints cleanly', () => {
      const res = evaluateOrderRisk(makeIntent(0.2), 50000, {
        ...baseParams,
      });
      // Notional = 10000.
      expect(res.approved).toBe(true);
      expect(res.scaledQty).toBe(0.2);
      expect(res.postCashRatio).toBeCloseTo((50000 - 10000) / 100000);
      expect(res.grossLev).toBeCloseTo((15000 + 10000) / 100000);
    });
  });
});
