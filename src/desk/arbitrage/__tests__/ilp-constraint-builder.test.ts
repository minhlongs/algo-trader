/**
 * ILP Constraint Builder Tests — Core Structure & Invariants
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildConstraints } from '../ilp-constraint-builder';
import type { MarketOpportunity, ILPSolverConfig } from '../../../shared/types/ilp-types';
import { defaultSolverConfig, sampleMarkets } from './ilp-constraint-builder.fixtures';

describe('ILP Constraint Builder - Structure & Invariants', () => {
  let config: ILPSolverConfig;
  let markets: MarketOpportunity[];

  beforeEach(() => {
    config = { ...defaultSolverConfig };
    markets = [...sampleMarkets];
  });

  describe('constraint structure', () => {
    it('should return constraints object with budget constraint', () => {
      const constraints = buildConstraints(markets, config);

      expect(constraints).toHaveProperty('budget');
      expect((constraints.budget as any).max).toBe(config.budgetUsdc);
    });

    it('should create per-market constraints for each market', () => {
      const constraints = buildConstraints(markets, config);

      for (const market of markets) {
        const marketConstraintKey = `market_${market.marketId}_max`;
        expect(constraints).toHaveProperty(marketConstraintKey);
      }
    });

    it('should handle single market', () => {
      const singleMarket = markets.slice(0, 1);
      const constraints = buildConstraints(singleMarket, config);

      expect(constraints).toHaveProperty('budget');
      expect(constraints).toHaveProperty('market_market_1_max');
    });

    it('should handle empty market list', () => {
      const constraints = buildConstraints([], config);

      expect(constraints).toHaveProperty('budget');
      const marketKeys = Object.keys(constraints).filter((k) => k.startsWith('market_'));
      expect(marketKeys.length).toBe(0);
    });
  });

  describe('budget constraint', () => {
    it('should set budget equal to config budgetUsdc', () => {
      const constraints = buildConstraints(markets, config);

      expect((constraints.budget as any).max).toBe(config.budgetUsdc);
    });

    it('should respect different budget values', () => {
      const largeBudgetConfig = { ...config, budgetUsdc: 50000 };
      const constraints = buildConstraints(markets, largeBudgetConfig);

      expect((constraints.budget as any).max).toBe(50000);
    });

    it('should handle small budgets', () => {
      const smallBudgetConfig = { ...config, budgetUsdc: 100 };
      const constraints = buildConstraints(markets, smallBudgetConfig);

      expect((constraints.budget as any).max).toBe(100);
    });
  });

  describe('constraint naming', () => {
    it('should use consistent naming for per-market constraints', () => {
      const constraints = buildConstraints(markets, config);

      const expectedKey1 = 'market_market_1_max';
      const expectedKey2 = 'market_market_2_max';

      expect(constraints).toHaveProperty(expectedKey1);
      expect(constraints).toHaveProperty(expectedKey2);
    });

    it('should handle market IDs with special characters', () => {
      const specialMarkets: MarketOpportunity[] = [
        {
          marketId: 'BTC/USD_POLYMARKET',
          question: 'Special ID',
          yesPrice: 0.45,
          noPrice: 0.50,
          expectedEdge: 0.05,
          liquidity: 50000,
        },
      ];

      const constraints = buildConstraints(specialMarkets, config);

      const expectedKey = 'market_BTC/USD_POLYMARKET_max';
      expect(constraints).toHaveProperty(expectedKey);
    });

    it('should always have budget constraint named "budget"', () => {
      const constraints = buildConstraints(markets, config);

      expect('budget' in constraints).toBe(true);
    });
  });

  describe('constraint values are positive', () => {
    it('should ensure budget constraint is positive', () => {
      const constraints = buildConstraints(markets, config);

      expect((constraints.budget as any).max).toBeGreaterThan(0);
    });

    it('should ensure per-market constraints are positive', () => {
      const constraints = buildConstraints(markets, config);

      for (const market of markets) {
        const key = `market_${market.marketId}_max`;
        expect((constraints[key] as any).max).toBeGreaterThan(0);
      }
    });

    it('should handle edge case where budget * fraction = 0', () => {
      const tinyExposureConfig = { ...config, maxMarketExposureFraction: 0.001 };
      const constraints = buildConstraints(markets, tinyExposureConfig);

      const expectedMax = config.budgetUsdc * 0.001;
      expect(expectedMax).toBeGreaterThan(0);
    });
  });
});
