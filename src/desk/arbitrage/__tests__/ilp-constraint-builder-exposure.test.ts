/**
 * ILP Constraint Builder Tests — Exposure, Scalability & Sensitivity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildConstraints } from '../ilp-constraint-builder';
import type { MarketOpportunity, ILPSolverConfig } from '../../../shared/types/ilp-types';
import { defaultSolverConfig, sampleMarkets, createManyMarkets } from './ilp-constraint-builder.fixtures';

describe('ILP Constraint Builder - Exposure, Scalability & Sensitivity', () => {
  let config: ILPSolverConfig;
  let markets: MarketOpportunity[];

  beforeEach(() => {
    config = { ...defaultSolverConfig };
    markets = [...sampleMarkets];
  });

  describe('per-market exposure constraints', () => {
    it('should calculate per-market max from budget and exposure fraction', () => {
      const constraints = buildConstraints(markets, config);

      const expectedMax = config.budgetUsdc * config.maxMarketExposureFraction;
      for (const market of markets) {
        const constraintKey = `market_${market.marketId}_max`;
        expect((constraints[constraintKey] as any).max).toBe(expectedMax);
      }
    });

    it('should respect different exposure fractions', () => {
      const highExposureConfig = { ...config, maxMarketExposureFraction: 0.5 };
      const constraints = buildConstraints(markets, highExposureConfig);

      const expectedMax = config.budgetUsdc * 0.5;
      const market1Key = 'market_market_1_max';
      expect((constraints[market1Key] as any).max).toBe(expectedMax);
    });

    it('should handle very restrictive exposure limits', () => {
      const restrictiveConfig = { ...config, maxMarketExposureFraction: 0.05 };
      const constraints = buildConstraints(markets, restrictiveConfig);

      const expectedMax = config.budgetUsdc * 0.05;
      const market1Key = 'market_market_1_max';
      expect((constraints[market1Key] as any).max).toBe(expectedMax);
    });

    it('should handle 100% exposure fraction (no limit per market)', () => {
      const noLimitConfig = { ...config, maxMarketExposureFraction: 1.0 };
      const constraints = buildConstraints(markets, noLimitConfig);

      const expectedMax = config.budgetUsdc;
      const market1Key = 'market_market_1_max';
      expect((constraints[market1Key] as any).max).toBe(expectedMax);
    });
  });

  describe('scalability', () => {
    it('should handle many markets', () => {
      const manyMarkets = createManyMarkets(100);
      const constraints = buildConstraints(manyMarkets, config);

      // Should have budget + 100 per-market constraints
      expect(Object.keys(constraints).length).toBe(101);
    });

    it('should generate constraints quickly', () => {
      const largeMarketList = createManyMarkets(1000);

      const startTime = performance.now();
      buildConstraints(largeMarketList, config);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('config sensitivity', () => {
    it('should update constraints when budget changes', () => {
      const config1 = { ...config, budgetUsdc: 10000 };
      const config2 = { ...config, budgetUsdc: 20000 };

      const constraints1 = buildConstraints(markets, config1);
      const constraints2 = buildConstraints(markets, config2);

      expect((constraints1.budget as any).max).toBe(10000);
      expect((constraints2.budget as any).max).toBe(20000);
      expect((constraints2.budget as any).max).toBe(2 * (constraints1.budget as any).max);
    });

    it('should propagate exposure fraction changes', () => {
      const exposureConfig1 = { ...config, maxMarketExposureFraction: 0.2 };
      const exposureConfig2 = { ...config, maxMarketExposureFraction: 0.4 };

      const constraints1 = buildConstraints(markets, exposureConfig1);
      const constraints2 = buildConstraints(markets, exposureConfig2);

      const key = 'market_market_1_max';
      const max1 = (constraints1[key] as any).max;
      const max2 = (constraints2[key] as any).max;

      expect(max2).toBe(2 * max1);
    });
  });

  describe('determinism', () => {
    it('should generate same constraints for same inputs', () => {
      const constraints1 = buildConstraints(markets, config);
      const constraints2 = buildConstraints(markets, config);

      expect((constraints1.budget as any).max).toBe((constraints2.budget as any).max);
    });

    it('should be independent of market order', () => {
      const marketsReversed = [...markets].reverse();

      const constraints1 = buildConstraints(markets, config);
      const constraints2 = buildConstraints(marketsReversed, config);

      // Budget should be same
      expect((constraints1.budget as any).max).toBe((constraints2.budget as any).max);

      // Per-market constraints should exist for all markets
      for (const market of markets) {
        const key = `market_${market.marketId}_max`;
        expect(constraints2).toHaveProperty(key);
      }
    });
  });
});
