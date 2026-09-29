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
import { createBalancedEngineReturns } from '../fixtures/test-data.fixture';

export function registerTier1AllocatorServiceTests(): void {
  describe('Feature 3: Performance-Weighted Tilts (F3)', () => {
    it('F3.1: computes annualized Sharpe ratio from return series', () => {
      const returns = [0.01, 0.02, 0.015, -0.005, 0.03, 0.01];
      const sharpe = computeSharpe(returns);
      expect(sharpe).toBeGreaterThan(0);
    });

    it('F3.2: computes Sortino ratio isolating downside volatility', () => {
      const returns = [0.02, 0.01, -0.01, 0.03, -0.005];
      const sortino = computeSortino(returns);
      expect(Number.isFinite(sortino)).toBe(true);
    });

    it('F3.3: tilts risk budgets higher for strategies with higher Sharpe/Sortino', () => {
      const engine = new PerformanceTiltEngine();
      const budgets = engine.computeTiltedBudgets({
        arbitrage: { engineId: 'arbitrage', rollingSharpe: 2.8, rollingSortino: 3.5, rollingVolatility: 0.05, totalPnlUsd: 1000 },
        marl: { engineId: 'marl', rollingSharpe: 0.5, rollingSortino: 0.6, rollingVolatility: 0.15, totalPnlUsd: 100 },
        amm: { engineId: 'amm', rollingSharpe: 1.0, rollingSortino: 1.2, rollingVolatility: 0.08, totalPnlUsd: 300 },
        'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1.5, rollingSortino: 1.8, rollingVolatility: 0.12, totalPnlUsd: 500 },
      }, 'RANGING');
      expect(budgets.arbitrage).toBeGreaterThan(budgets.marl);
    });

    it('F3.4: applies regime affinity multiplier according to market regime', () => {
      const engine = new PerformanceTiltEngine();
      const perf = {
        arbitrage: { engineId: 'arbitrage' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        marl: { engineId: 'marl' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        amm: { engineId: 'amm' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        'alpha-lab': { engineId: 'alpha-lab' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
      };
      const highVolBudgets = engine.computeTiltedBudgets(perf, 'HIGH_VOLATILITY');
      expect(highVolBudgets.arbitrage).toBeGreaterThan(highVolBudgets.marl);
    });

    it('F3.5: clamps budgets strictly within [minRiskBudget, maxRiskBudget] (5% to 50%)', () => {
      const engine = new PerformanceTiltEngine({ minRiskBudget: 0.05, maxRiskBudget: 0.50 });
      const budgets = engine.computeTiltedBudgets({
        arbitrage: { engineId: 'arbitrage', rollingSharpe: 10.0, rollingSortino: 15.0, rollingVolatility: 0.01, totalPnlUsd: 10000 },
        marl: { engineId: 'marl', rollingSharpe: -5.0, rollingSortino: -5.0, rollingVolatility: 0.50, totalPnlUsd: -5000 },
        amm: { engineId: 'amm', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.10, totalPnlUsd: 100 },
        'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.10, totalPnlUsd: 100 },
      }, 'TRENDING');
      for (const id of ENGINE_IDS) {
        expect(budgets[id]).toBeGreaterThanOrEqual(0.05);
        expect(budgets[id]).toBeLessThanOrEqual(0.50);
      }
    });
  });

  describe('Feature 4: Capital Lock & Buffer Guard (F4)', () => {
    it('F4.1: enforces minimum 20% liquid cash buffer reserves', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const res = guard.applyGuard(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(res.cashBufferRatio).toBeGreaterThanOrEqual(0.20);
      expect(res.unallocatedCashUsd).toBeCloseTo(20000, 2);
    });

    it('F4.2: prevents starvation of active positions by clamping allocations to lockedCapital', () => {
      const guard = new CapitalBufferGuard();
      const res = guard.applyGuard(100000, { arbitrage: 0.05, marl: 0.05, amm: 0.05, 'alpha-lab': 0.85 }, { arbitrage: 15000, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(res.allocatedCapitalUsd.arbitrage).toBeGreaterThanOrEqual(15000);
      expect(res.drainModeEngines).toContain('arbitrage');
    });

    it('F4.3: respects rebalance deadband ignoring minute weight fluctuations', () => {
      const guard = new CapitalBufferGuard({ rebalanceDeadband: 0.05 });
      const res = guard.checkDeadband(
        { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
        { arbitrage: 25500, marl: 24500, amm: 25000, 'alpha-lab': 25000 }
      );
      expect(res.shouldRebalance).toBe(false);
    });

    it('F4.4: triggers rebalance when weight drift exceeds deadband threshold', () => {
      const guard = new CapitalBufferGuard({ rebalanceDeadband: 0.03 });
      const res = guard.checkDeadband(
        { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
        { arbitrage: 30000, marl: 20000, amm: 25000, 'alpha-lab': 25000 }
      );
      expect(res.shouldRebalance).toBe(true);
    });

    it('F4.5: suppresses frequent rebalancing within cooldown period', () => {
      const guard = new CapitalBufferGuard({ cooldownPeriodMs: 60000 });
      guard.recordRebalance(1000);
      expect(guard.checkCooldown(1000 + 30000)).toBe(false);
      expect(guard.checkCooldown(1000 + 70000)).toBe(true);
    });
  });

  describe('Feature 5: Portfolio Allocator Service (F5)', () => {
    it('F5.1: orchestrates end-to-end allocation returning valid PortfolioAllocation', () => {
      const allocator = new PortfolioAllocator();
      const returns = createBalancedEngineReturns(20);
      returns.forEach((r) => allocator.updateReturns(r));
      const res = allocator.allocate({
        totalNavUsd: 100000,
        currentAllocations: { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
        lockedCapital: { arbitrage: 5000, marl: 5000, amm: 5000, 'alpha-lab': 5000 },
        regime: 'RANGING',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 1.8, rollingSortino: 2.1, rollingVolatility: 0.05, totalPnlUsd: 2000 },
          marl: { engineId: 'marl', rollingSharpe: 1.2, rollingSortino: 1.4, rollingVolatility: 0.12, totalPnlUsd: 1200 },
          amm: { engineId: 'amm', rollingSharpe: 1.5, rollingSortino: 1.7, rollingVolatility: 0.07, totalPnlUsd: 1500 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 2.0, rollingSortino: 2.4, rollingVolatility: 0.10, totalPnlUsd: 2200 },
        },
      });
      expect(res.cashBufferRatio).toBeGreaterThanOrEqual(0.20);
      expect(res.unallocatedCashUsd).toBeGreaterThanOrEqual(20000);
      expect(res.maxRiskDiscrepancy).toBeLessThanOrEqual(1e-4);
    });

    it('F5.2: validates input context via strict Zod schema', () => {
      const allocator = new PortfolioAllocator();
      expect(() => allocator.allocate({ totalNavUsd: -100 } as unknown as Parameters<typeof allocator.allocate>[0])).toThrow();
    });

    it('F5.3: dynamically adapts to regime changes updating allocation weights', () => {
      const allocator = new PortfolioAllocator();
      const baseContext = {
        totalNavUsd: 100000,
        currentAllocations: { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
        lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
        performance: {
          arbitrage: { engineId: 'arbitrage' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          marl: { engineId: 'marl' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          amm: { engineId: 'amm' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          'alpha-lab': { engineId: 'alpha-lab' as EngineId, rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        },
      };
      const allocHighVol = allocator.allocate({ ...baseContext, regime: 'HIGH_VOLATILITY' });
      const allocRanging = allocator.allocate({ ...baseContext, regime: 'RANGING' });
      expect(allocHighVol.allocatedCapitalUsd.arbitrage).toBeGreaterThan(allocRanging.allocatedCapitalUsd.arbitrage);
    });

    it('F5.4: maintains unallocated cash buffer invariant when total NAV changes', () => {
      const allocator = new PortfolioAllocator();
      const res = allocator.allocate({
        totalNavUsd: 500000,
        currentAllocations: { arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 },
        lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
        regime: 'TRENDING',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          marl: { engineId: 'marl', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          amm: { engineId: 'amm', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1, rollingSortino: 1, rollingVolatility: 0.1, totalPnlUsd: 0 },
        },
      });
      expect(res.unallocatedCashUsd).toBeGreaterThanOrEqual(100000);
    });

    it('F5.5: allows updating configuration parameters at runtime', () => {
      const allocator = new PortfolioAllocator({ minCashBufferRatio: 0.25 });
      expect(allocator.getConfig().minCashBufferRatio).toBe(0.25);
      allocator.updateConfig({ minCashBufferRatio: 0.30 });
      expect(allocator.getConfig().minCashBufferRatio).toBe(0.30);
    });
  });
}
