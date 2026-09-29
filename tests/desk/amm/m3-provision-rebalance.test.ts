import { describe, expect, it } from 'vitest';
import {
  AdverseSelectionGuard,
  InventoryDeltaRebalancer,
  MarketState,
  QuoterInventory,
  TwoSidedQuoter,
} from '../../../src/desk/amm';

describe('Milestone 3 — Dynamic Liquidity Provision & Cross-Market Rebalancing', () => {
  describe('TwoSidedQuoter', () => {
    it('generates two-sided quotes with Avellaneda-Stoikov inventory skewing', () => {
      const market: MarketState = {
        marketId: 'mkt-polymarket-1',
        spotPrices: { YES: 0.60, NO: 0.40 },
        volatility: 0.02,
        timeToMaturitySec: 86400,
      };

      // Neutral inventory
      const neutralInv: QuoterInventory = { holdings: { YES: 0, NO: 0 } };
      const neutralQuotes = TwoSidedQuoter.generateQuotes(market, neutralInv);

      expect(neutralQuotes.YES).toBeDefined();
      expect(neutralQuotes.YES.bidPrice).toBeLessThan(0.60);
      expect(neutralQuotes.YES.askPrice).toBeGreaterThan(0.60);
      expect(neutralQuotes.YES.skewOffset).toBeCloseTo(0, 4);

      // Long YES inventory -> lowers reservation price (lower bid, lower ask)
      const longInv: QuoterInventory = { holdings: { YES: 1000, NO: 0 } };
      const skewedQuotes = TwoSidedQuoter.generateQuotes(market, longInv);

      expect(skewedQuotes.YES.skewOffset).toBeGreaterThan(0);
      expect(skewedQuotes.YES.bidPrice).toBeLessThanOrEqual(neutralQuotes.YES.bidPrice);
      expect(skewedQuotes.YES.askPrice).toBeLessThanOrEqual(neutralQuotes.YES.askPrice);
    });

    it('clamps quotes strictly within [0.01, 0.99] bounds and preserves minimum spread', () => {
      const market: MarketState = {
        marketId: 'mkt-extreme',
        spotPrices: { YES: 0.98, NO: 0.02 },
        volatility: 0.05,
        timeToMaturitySec: 43200,
      };

      const inventory: QuoterInventory = { holdings: { YES: 5000, NO: -5000 } };
      const quotes = TwoSidedQuoter.generateQuotes(market, inventory);

      for (const quote of Object.values(quotes)) {
        expect(quote.bidPrice).toBeGreaterThanOrEqual(0.01);
        expect(quote.bidPrice).toBeLessThanOrEqual(0.98);
        expect(quote.askPrice).toBeGreaterThan(quote.bidPrice);
        expect(quote.askPrice).toBeLessThanOrEqual(0.99);
      }
    });
  });

  describe('InventoryDeltaRebalancer', () => {
    it('generates rebalance orders when inventory exceeds tolerance threshold', () => {
      const inventory: QuoterInventory = {
        holdings: { YES: 1600, NO: -800, MAYBE: 200 },
      };
      const refPrices = { YES: 0.55, NO: 0.35, MAYBE: 0.10 };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);

      // YES: excess 1100 (1600 - 500), side: SELL, urgency: HIGH (> 2*500)
      const yesOrder = orders.find((o) => o.outcomeId === 'YES');
      expect(yesOrder).toBeDefined();
      expect(yesOrder!.side).toBe('SELL');
      expect(yesOrder!.targetQuantity).toBe(1100);
      expect(yesOrder!.urgency).toBe('HIGH');
      expect(yesOrder!.limitPrice).toBeLessThan(0.55);

      // NO: excess 300 (800 - 500), side: BUY, urgency: MEDIUM (<= 2*500)
      const noOrder = orders.find((o) => o.outcomeId === 'NO');
      expect(noOrder).toBeDefined();
      expect(noOrder!.side).toBe('BUY');
      expect(noOrder!.targetQuantity).toBe(300);
      expect(noOrder!.urgency).toBe('MEDIUM');
      expect(noOrder!.limitPrice).toBeGreaterThan(0.35);

      // MAYBE: within 500 tolerance -> no order
      const maybeOrder = orders.find((o) => o.outcomeId === 'MAYBE');
      expect(maybeOrder).toBeUndefined();
    });

    it('returns empty array when all inventories are within tolerance limit', () => {
      const inventory: QuoterInventory = { holdings: { YES: 250, NO: -300 } };
      const refPrices = { YES: 0.50, NO: 0.50 };
      const orders = InventoryDeltaRebalancer.evaluateRebalance(inventory, refPrices, 500);
      expect(orders).toHaveLength(0);
    });
  });

  describe('AdverseSelectionGuard', () => {
    it('calculates VPIN accurately and slices volume across consecutive buckets', () => {
      const guard = new AdverseSelectionGuard({
        bucketSizeVolume: 1000,
        windowBucketCount: 5,
        vpinWarningThreshold: 0.4,
        vpinCriticalThreshold: 0.7,
      });

      // Insert 2500 pure BUY volume -> spans 2 complete buckets + 500 remainder
      guard.recordTrade(2500, 'BUY');
      expect(guard.getCompletedBucketsCount()).toBe(2);

      // Assess flow with 2500 more BUY -> total 4 complete buckets with 100% buy imbalance
      const assessment = guard.assessFlow(2500, 'BUY');
      expect(guard.getCompletedBucketsCount()).toBe(5);
      expect(assessment.vpin).toBeCloseTo(1.0, 2);
      expect(assessment.toxicityLevel).toBe('CRITICAL');
      expect(assessment.shouldTripwirePullQuotes).toBe(true);
      expect(assessment.dynamicFeeMultiplier).toBe(3.0);
      expect(assessment.cooldownPeriodMs).toBe(30000);
    });

    it('trips critical tripwire upon detecting rapid sweep burst velocity', () => {
      const guard = new AdverseSelectionGuard({
        sweepVelocityThreshold: 2000,
      });

      // Rapid burst of 3000 volume in 100ms
      const assessment = guard.assessFlow(3000, 'SELL');
      expect(assessment.toxicityLevel).toBe('CRITICAL');
      expect(assessment.shouldTripwirePullQuotes).toBe(true);
      expect(assessment.reason).toBe('RAPID_SWEEP_BURST_DETECTED');
    });

    it('scales dynamic fee smoothly under moderate order imbalance', () => {
      const guard = new AdverseSelectionGuard({
        bucketSizeVolume: 500,
        windowBucketCount: 4,
        vpinWarningThreshold: 0.4,
        vpinCriticalThreshold: 0.8,
        maxDynamicFeeMultiplier: 3.0,
      });

      // Fill 4 balanced buckets with older timestamps: 300 buy, 200 sell -> 100 imbalance / 500 = 0.20 VPIN
      const baseTime = Date.now() - 500;
      for (let i = 0; i < 4; i++) {
        guard.recordTrade(300, 'BUY', baseTime + i * 20);
        guard.recordTrade(200, 'SELL', baseTime + i * 20 + 5);
      }

      const lowAssessment = guard.assessFlow(10, 'BUY');
      expect(lowAssessment.vpin).toBeCloseTo(0.2, 2);
      expect(lowAssessment.toxicityLevel).toBe('LOW');
      expect(lowAssessment.dynamicFeeMultiplier).toBe(1.0);
    });
  });
});
