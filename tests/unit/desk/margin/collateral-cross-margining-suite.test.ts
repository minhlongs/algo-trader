import { describe, it, expect } from 'vitest';
import { IsdaSimmEngine } from '../../../../src/desk/margin/isda-simm-engine';
import { CrossMarginingEngine } from '../../../../src/desk/margin/cross-margining-engine';
import { CollateralWaterfallAllocator } from '../../../../src/desk/margin/collateral-waterfall-allocator';

describe('Collateral & Cross-Margining Optimization Suite', () => {
  describe('IsdaSimmEngine', () => {
    it('computes initial margin with delta, vega, curvature and concentration scaling', () => {
      const simm = new IsdaSimmEngine();

      const buckets = [
        { bucketId: 'EQUITY_LARGE_CAP', riskWeight: 0.16, netDeltaSensitivity: 5_000_000, vegaSensitivity: 200_000, curvatureSensitivity: 100_000 },
        { bucketId: 'RATES_USD_10Y', riskWeight: 0.08, netDeltaSensitivity: 10_000_000, vegaSensitivity: 150_000, curvatureSensitivity: 50_000 },
      ];

      const result = simm.computeInitialMargin(buckets, 0.40, 10_000_000);

      expect(result.deltaMarginUsd).toBeGreaterThan(0);
      expect(result.vegaMarginUsd).toBeGreaterThan(0);
      expect(result.curvatureMarginUsd).toBeGreaterThan(0);
      expect(result.totalInitialMarginUsd).toBeGreaterThan(0);
      expect(result.concentrationScaleFactor).toBeGreaterThanOrEqual(1.0);

      // Variation margin computation
      const vm = simm.computeVariationMargin(10_000_000, 9_850_000);
      expect(vm).toBe(150_000);
    });

    it('throws error when no buckets provided or negative risk weight', () => {
      const simm = new IsdaSimmEngine();
      expect(() => simm.computeInitialMargin([])).toThrow('At least one sensitivity bucket');
      expect(() =>
        simm.computeInitialMargin([
          { bucketId: 'B1', riskWeight: -0.1, netDeltaSensitivity: 100, vegaSensitivity: 10, curvatureSensitivity: 5 },
        ])
      ).toThrow('cannot be negative');
    });
  });

  describe('CrossMarginingEngine', () => {
    it('evaluates portfolio risk offsets across correlated classes reducing gross margin', () => {
      const crossMargin = new CrossMarginingEngine();

      const positions = [
        { symbol: 'ESZ6', assetClass: 'EQUITY' as const, quantity: 10, contractMultiplier: 50, marketPrice: 5800, standaloneMarginRequirementUsd: 120_000 },
        { symbol: 'BTC_PERP', assetClass: 'CRYPTO' as const, quantity: 5, contractMultiplier: 1, marketPrice: 65000, standaloneMarginRequirementUsd: 80_000 },
      ];

      const offsetMatrix = {
        correlationMatrix: {
          'EQUITY:CRYPTO': 0.30,
        },
      };

      const result = crossMargin.evaluateCrossMarginPortfolio(positions, offsetMatrix);

      expect(result.grossStandaloneMarginUsd).toBe(200_000);
      expect(result.diversifiedMarginRequirementUsd).toBeLessThan(200_000);
      expect(result.marginSavingsUsd).toBeGreaterThan(0);
      expect(result.capitalEfficiencyRatio).toBeGreaterThan(1.0);
    });

    it('rejects empty positions list', () => {
      const crossMargin = new CrossMarginingEngine();
      expect(() => crossMargin.evaluateCrossMarginPortfolio([], { correlationMatrix: {} })).toThrow('cannot be empty');
    });
  });

  describe('CollateralWaterfallAllocator', () => {
    it('allocates collateral down the liquidity waterfall while preserving cash', () => {
      const allocator = new CollateralWaterfallAllocator();

      const holdings = [
        { holdingId: 'CASH_USD', assetClass: 'CASH' as const, marketValueUsd: 100_000, haircutPercentage: 0.0, liquidityTier: 1 as const },
        { holdingId: 'US_TREASURY_10Y', assetClass: 'SOVEREIGN_DEBT' as const, marketValueUsd: 100_000, haircutPercentage: 0.02, liquidityTier: 2 as const },
        { holdingId: 'CORP_BOND', assetClass: 'INVESTMENT_GRADE_BOND' as const, marketValueUsd: 100_000, haircutPercentage: 0.10, liquidityTier: 3 as const },
      ];

      // Required margin: $150,000. With preserveCashLiquidity=true, Corp Bond (Tier 3) and Treasury (Tier 2) are pledged first.
      const result = allocator.allocateCollateral(150_000, holdings, true);

      expect(result.isFullyCollateralized).toBe(true);
      expect(result.totalPledgedPostHaircutUsd).toBeCloseTo(150_000, 1);

      // Verify Corp Bond was pledged first
      const corpAlloc = result.allocations.find(a => a.holdingId === 'CORP_BOND');
      expect(corpAlloc?.pledgedPostHaircutUsd).toBe(90_000); // 100,000 * 0.90
    });

    it('throws error for non-positive required margin', () => {
      const allocator = new CollateralWaterfallAllocator();
      expect(() => allocator.allocateCollateral(0, [])).toThrow('strictly positive');
    });
  });
});
