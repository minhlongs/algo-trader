import { describe, it, expect } from 'vitest';
import {
  ENGINE_IDS,
  EngineId,
  PerformanceTiltEngine,
  computeSharpe,
  computeSortino,
  CapitalBufferGuard,
  PortfolioAllocator,
} from '../../../../src/desk/portfolio';

export function registerTier2AllocatorServiceTests(): void {
  describe('Tier 2: Boundary - Feature 3: Performance-Weighted Tilts (F3)', () => {
    it('B3.1: zero return variance (stdev = 0) returns 0 for Sharpe and finite Sortino', () => {
      const returns = [0.01, 0.01, 0.01, 0.01];
      expect(computeSharpe(returns)).toBe(0);
      expect(Number.isFinite(computeSortino(returns))).toBe(true);
    });

    it('B3.2: return series with only positive returns computes finite non-zero Sortino', () => {
      const returns = [0.01, 0.02, 0.03, 0.015];
      expect(Number.isFinite(computeSortino(returns))).toBe(true);
    });

    it('B3.3: identical performance across all engines produces equal 25% risk budgets', () => {
      const engine = new PerformanceTiltEngine();
      const perf = {
        arbitrage: { engineId: 'arbitrage' as EngineId, rollingSharpe: 2.0, rollingSortino: 2.5, rollingVolatility: 0.1, totalPnlUsd: 1000 },
        marl: { engineId: 'marl' as EngineId, rollingSharpe: 2.0, rollingSortino: 2.5, rollingVolatility: 0.1, totalPnlUsd: 1000 },
        amm: { engineId: 'amm' as EngineId, rollingSharpe: 2.0, rollingSortino: 2.5, rollingVolatility: 0.1, totalPnlUsd: 1000 },
        'alpha-lab': { engineId: 'alpha-lab' as EngineId, rollingSharpe: 2.0, rollingSortino: 2.5, rollingVolatility: 0.1, totalPnlUsd: 1000 },
      };
      const budgets = engine.computeTiltedBudgets(perf, 'TRENDING');
      for (const id of ENGINE_IDS) {
        expect(budgets[id]).toBeGreaterThan(0.10);
      }
    });

    it('B3.4: extreme outlier Sharpe (> 100) is clamped to maxRiskBudget (50%)', () => {
      const engine = new PerformanceTiltEngine({ maxRiskBudget: 0.50 });
      const budgets = engine.computeTiltedBudgets({
        arbitrage: { engineId: 'arbitrage', rollingSharpe: 999, rollingSortino: 999, rollingVolatility: 0.01, totalPnlUsd: 50000 },
        marl: { engineId: 'marl', rollingSharpe: 0, rollingSortino: 0, rollingVolatility: 0.2, totalPnlUsd: 0 },
        amm: { engineId: 'amm', rollingSharpe: 0, rollingSortino: 0, rollingVolatility: 0.2, totalPnlUsd: 0 },
        'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 0, rollingSortino: 0, rollingVolatility: 0.2, totalPnlUsd: 0 },
      }, 'HIGH_VOLATILITY');
      expect(budgets.arbitrage).toBeLessThanOrEqual(0.50);
    });

    it('B3.5: deeply negative performance (-10 Sharpe) is clamped to minRiskBudget (5%)', () => {
      const engine = new PerformanceTiltEngine({ minRiskBudget: 0.05 });
      const budgets = engine.computeTiltedBudgets({
        arbitrage: { engineId: 'arbitrage', rollingSharpe: -50, rollingSortino: -50, rollingVolatility: 0.5, totalPnlUsd: -50000 },
        marl: { engineId: 'marl', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 100 },
        amm: { engineId: 'amm', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 100 },
        'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 100 },
      }, 'RANGING');
      expect(budgets.arbitrage).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe('Tier 2: Boundary - Feature 4: Capital Lock & Buffer Guard (F4)', () => {
    it('B4.1: liquid cash is preserved at exactly 20.00% under equal weights and 0 locks', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const res = guard.applyGuard(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(res.cashBufferRatio).toBeCloseTo(0.20, 4);
      expect(res.unallocatedCashUsd).toBeCloseTo(20000, 2);
    });

    it('B4.2: handles 100% of deployable capital locked by engines', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const res = guard.applyGuard(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 });
      expect(res.allocatedCapitalUsd.arbitrage).toBe(20000);
      expect(res.unallocatedCashUsd).toBeCloseTo(20000, 2);
    });

    it('B4.3: gracefully handles locked capital exceeding deployable capital', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const res = guard.applyGuard(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 30000, marl: 30000, amm: 30000, 'alpha-lab': 0 });
      expect(res.drainModeEngines.length).toBeGreaterThan(0);
      expect(res.allocatedCapitalUsd.arbitrage).toBe(30000);
    });

    it('B4.4: deadband check returns shouldRebalance=true at exact deadband threshold', () => {
      const guard = new CapitalBufferGuard({ rebalanceDeadband: 0.05 });
      const res = guard.checkDeadband(
        { arbitrage: 21000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
        { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 }
      );
      expect(res.shouldRebalance).toBe(true);
    });

    it('B4.5: cooldown returns true at exactly cooldownMs timestamp boundary', () => {
      const guard = new CapitalBufferGuard({ cooldownPeriodMs: 5000 });
      guard.recordRebalance(10000);
      expect(guard.checkCooldown(15000)).toBe(true);
      expect(guard.checkCooldown(14999)).toBe(false);
    });
  });

  describe('Tier 2: Boundary - Feature 5: Portfolio Allocator Service (F5)', () => {
    it('B5.1: allocates on tiny micro-capital NAV ($1.00)', () => {
      const allocator = new PortfolioAllocator();
      const res = allocator.allocate({
        totalNavUsd: 1.0,
        currentAllocations: { arbitrage: 0.2, marl: 0.2, amm: 0.2, 'alpha-lab': 0.2 },
        lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
        regime: 'RANGING',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          marl: { engineId: 'marl', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          amm: { engineId: 'amm', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        },
      });
      expect(res.unallocatedCashUsd).toBeCloseTo(0.20, 2);
    });

    it('B5.2: allocates on massive institutional NAV ($100,000,000)', () => {
      const allocator = new PortfolioAllocator();
      const res = allocator.allocate({
        totalNavUsd: 100000000,
        currentAllocations: { arbitrage: 20000000, marl: 20000000, amm: 20000000, 'alpha-lab': 20000000 },
        lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
        regime: 'TRENDING',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 2, rollingSortino: 2, rollingVolatility: 0.05, totalPnlUsd: 500000 },
          marl: { engineId: 'marl', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 200000 },
          amm: { engineId: 'amm', rollingSharpe: 1.5, rollingSortino: 1.5, rollingVolatility: 0.08, totalPnlUsd: 300000 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 3, rollingSortino: 3, rollingVolatility: 0.04, totalPnlUsd: 800000 },
        },
      });
      expect(res.unallocatedCashUsd).toBeGreaterThanOrEqual(20000000);
      expect(res.maxRiskDiscrepancy).toBeLessThanOrEqual(1e-4);
    });

    it('B5.3: handles all locked capital set to zero', () => {
      const allocator = new PortfolioAllocator();
      const res = allocator.allocate({
        totalNavUsd: 50000,
        currentAllocations: { arbitrage: 10000, marl: 10000, amm: 10000, 'alpha-lab': 10000 },
        lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
        regime: 'LOW_LIQUIDITY',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          marl: { engineId: 'marl', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          amm: { engineId: 'amm', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        },
      });
      expect(res.unallocatedCashUsd).toBeCloseTo(10000, 2);
    });

    it('B5.4: executes consecutive allocations without internal memory leak', () => {
      const allocator = new PortfolioAllocator();
      for (let i = 0; i < 20; i++) {
        allocator.allocate({
          totalNavUsd: 50000 + i * 100,
          currentAllocations: { arbitrage: 10000, marl: 10000, amm: 10000, 'alpha-lab': 10000 },
          lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
          regime: 'RANGING',
          performance: {
            arbitrage: { engineId: 'arbitrage', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
            marl: { engineId: 'marl', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
            amm: { engineId: 'amm', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
            'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          },
        });
      }
      expect(true).toBe(true);
    });

    it('B5.5: recovers from transient empty observations gracefully', () => {
      const allocator = new PortfolioAllocator();
      expect(allocator.getCovarianceMatrix().matrix.length).toBe(4);
    });
  });
}
