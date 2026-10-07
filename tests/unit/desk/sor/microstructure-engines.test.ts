import { describe, it, expect } from 'vitest';
import { VpinToxicFlowClassifier } from '../../../../src/desk/risk/vpin-toxic-flow-classifier';
import { CombinatorialBundleRouter } from '../../../../src/desk/sor/combinatorial-bundle-router';
import { LpLvrYieldSentinel } from '../../../../src/desk/amm/lp-lvr-yield-sentinel';

describe('Market Microstructure & Liquidity Trilogy', () => {
  describe('VpinToxicFlowClassifier', () => {
    const classifier = new VpinToxicFlowClassifier({
      bucketVolumeSize: 500,
      totalBucketsN: 5,
      toxicThreshold: 0.60,
    });

    it('identifies toxic informed trade flow and widens quoting spread', () => {
      // Feed aggressive informed one-sided buy flow
      for (let i = 0; i < 6; i++) {
        classifier.recordTrade('market-btc-100k', {
          tradeId: `t-${i}`,
          price: 0.61, // Above mid
          volume: 500,
          timestampMs: 1000 + i * 100,
          arrivalMidPrice: 0.60,
        });
      }

      const metrics = classifier.evaluateMarketToxicity('market-btc-100k', 2000);
      expect(metrics.currentVpin).toBe(1.0); // 100% buy volume imbalance
      expect(metrics.toxicityRegime).toBe('TOXIC_INFORMED');
      expect(metrics.isAdverseSelectionImminent).toBe(true);
      expect(metrics.recommendedSpreadMultiplier).toBeGreaterThan(2.0);
    });
  });

  describe('CombinatorialBundleRouter', () => {
    const router = new CombinatorialBundleRouter(0.05);

    it('executes atomic outcome bundles with balanced fill ratios and no skew', () => {
      const result = router.routeBundle(
        'bundle-us-elections',
        [
          { legId: 'leg-pres', marketId: 'm-pres', outcome: 'YES', targetQuantity: 1000, maxLimitPrice: 0.60 },
          { legId: 'leg-sen', marketId: 'm-sen', outcome: 'YES', targetQuantity: 1000, maxLimitPrice: 0.50 },
        ],
        [
          { marketId: 'm-pres', bestOfferPrice: 0.58, availableQuantity: 1500 },
          { marketId: 'm-sen', bestOfferPrice: 0.48, availableQuantity: 800 }, // Leg 2 is bottleneck
        ]
      );

      // Should fill proportionally to the bottleneck (80%) without skew
      expect(result.isFullyFilled).toBe(false);
      expect(result.rollbackRequired).toBe(false);
      expect(result.maxSkewDiscrepancy).toBeLessThan(0.05);
      expect(result.executedLegs[0]!.filledQuantity).toBe(800);
      expect(result.executedLegs[1]!.filledQuantity).toBe(800);
      expect(result.blendedBundlePrice).toBeCloseTo(0.53, 2);
    });
  });

  describe('LpLvrYieldSentinel', () => {
    const sentinel = new LpLvrYieldSentinel();

    it('estimates continuous LVR drag and calculates delta-neutral perpetual hedge', () => {
      const pool = {
        poolAddress: '0xamm-pool-eth-usdc',
        assetPrice: 3000,
        poolTvlUsd: 1_000_000,
        feeTierBps: 30, // 0.3%
        dailyVolumeUsd: 500_000,
        rollingAnnualizedVol: 0.80, // 80% annual vol
      };

      const position = {
        positionId: 'pos-1',
        poolAddress: '0xamm-pool-eth-usdc',
        liquidityUnits: 100,
        positionValueUsd: 30_000,
        lowerTickPrice: 2000,
        upperTickPrice: 4000,
      };

      const metrics = sentinel.evaluatePoolYield(pool, position);

      // sigma^2 / 8 = 0.64 / 8 = 0.08 (8% LVR)
      expect(metrics.annualizedLvrPct).toBeCloseTo(8.0, 1);
      expect(metrics.feeAprPct).toBeGreaterThan(0);
      expect(metrics.recommendedDeltaHedgeUnits).toBeLessThan(0); // Short hedge
      expect(metrics.estimatedDailyLvrDragUsd).toBeGreaterThan(0);
    });
  });
});
