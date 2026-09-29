import { describe, it, expect } from 'vitest';
import {
  PortfolioAllocator,
  PortfolioAllocationSchema,
  ENGINE_IDS,
  EngineId,
  AllocationContext,
  StrategyPerformance,
} from '../../../src/desk/portfolio';
import {
  createBalancedEngineReturns,
  createShockEngineReturns,
} from './fixtures/test-data.fixture';

describe('PortfolioAllocator Master Orchestrator', () => {
  function makePerformance(
    sharpe = 1.5,
    sortino = 2.0
  ): Record<EngineId, StrategyPerformance> {
    const result: Partial<Record<EngineId, StrategyPerformance>> = {};
    for (const id of ENGINE_IDS) {
      result[id] = {
        engineId: id,
        rollingSharpe: sharpe,
        rollingSortino: sortino,
        rollingVolatility: 0.15,
        totalPnlUsd: 5000,
      };
    }
    return result as Record<EngineId, StrategyPerformance>;
  }

  it('runs complete allocation cycle satisfying all portfolio invariants', () => {
    const allocator = new PortfolioAllocator();
    const observations = createBalancedEngineReturns(30);

    // Warm up covariance estimator with observations
    for (const obs of observations) {
      allocator.updateReturns(obs);
    }

    const totalNavUsd = 100000;
    const context: AllocationContext = {
      totalNavUsd,
      currentAllocations: { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      lockedCapital: { arbitrage: 8000, marl: 12000, amm: 6000, 'alpha-lab': 9000 },
      regime: 'TRENDING',
      performance: makePerformance(2.2, 2.8),
    };

    const allocation = allocator.allocate(context);

    // 1. Conforms to Zod schema
    const parsed = PortfolioAllocationSchema.parse(allocation);
    expect(parsed).toBeDefined();

    // 2. Liquid cash buffer invariant: >= 20%
    expect(allocation.cashBufferRatio).toBeGreaterThanOrEqual(0.20);
    expect(allocation.unallocatedCashUsd).toBeGreaterThanOrEqual(20000);

    // 3. Zero accounting drift: sum(allocatedCapital) + unallocatedCash == totalNavUsd
    let sumAllocated = 0;
    for (const id of ENGINE_IDS) {
      sumAllocated += allocation.allocatedCapitalUsd[id];
    }
    expect(sumAllocated + allocation.unallocatedCashUsd).toBeCloseTo(totalNavUsd, 2);

    // 4. Weight conservation: sum(weights) + cashBufferRatio == 1.0
    let sumWeights = 0;
    for (const id of ENGINE_IDS) {
      sumWeights += allocation.weights[id];
    }
    expect(sumWeights + allocation.cashBufferRatio).toBeCloseTo(1.0, 4);

    // 5. Starvation lock protection: each engine receives at least lockedCapital
    for (const id of ENGINE_IDS) {
      expect(allocation.allocatedCapitalUsd[id]).toBeGreaterThanOrEqual(context.lockedCapital[id]);
    }

    // 6. ERC convergence tolerance: maxRiskDiscrepancy <= 1e-4
    expect(allocation.maxRiskDiscrepancy).toBeLessThanOrEqual(1e-4);
  });

  it('adapts allocations across market regimes (TRENDING vs HIGH_VOLATILITY)', () => {
    const allocator = new PortfolioAllocator();
    const observations = createBalancedEngineReturns(30);
    for (const obs of observations) {
      allocator.updateReturns(obs);
    }

    const baseContext: Omit<AllocationContext, 'regime'> = {
      totalNavUsd: 100000,
      currentAllocations: { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      lockedCapital: { arbitrage: 2000, marl: 2000, amm: 2000, 'alpha-lab': 2000 },
      performance: makePerformance(1.0, 1.2),
    };

    const trendingAlloc = allocator.allocate({ ...baseContext, regime: 'TRENDING' });
    const volatileAlloc = allocator.allocate({ ...baseContext, regime: 'HIGH_VOLATILITY' });

    // In TRENDING regime, alpha-lab has high affinity (1.45)
    // In HIGH_VOLATILITY regime, arbitrage has high affinity (1.35)
    expect(trendingAlloc.weights['alpha-lab']).toBeGreaterThan(volatileAlloc.weights['alpha-lab']);
    expect(volatileAlloc.weights.arbitrage).toBeGreaterThan(trendingAlloc.weights.arbitrage);
  });

  it('handles adverse shock returns gracefully without singular matrix collapse', () => {
    const allocator = new PortfolioAllocator({ ridgeEpsilon: 1e-7 });
    const shockReturns = createShockEngineReturns();

    for (const obs of shockReturns) {
      allocator.updateReturns(obs);
    }

    const context: AllocationContext = {
      totalNavUsd: 50000,
      currentAllocations: { arbitrage: 10000, marl: 10000, amm: 10000, 'alpha-lab': 10000 },
      lockedCapital: { arbitrage: 3000, marl: 4000, amm: 2000, 'alpha-lab': 5000 },
      regime: 'HIGH_VOLATILITY',
      performance: {
        arbitrage: { engineId: 'arbitrage', rollingSharpe: 0.5, rollingSortino: 0.6, rollingVolatility: 0.2, totalPnlUsd: 100 },
        marl: { engineId: 'marl', rollingSharpe: -1.2, rollingSortino: -1.8, rollingVolatility: 0.4, totalPnlUsd: -1200 },
        amm: { engineId: 'amm', rollingSharpe: -0.8, rollingSortino: -1.0, rollingVolatility: 0.3, totalPnlUsd: -500 },
        'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: -1.5, rollingSortino: -2.0, rollingVolatility: 0.45, totalPnlUsd: -1800 },
      },
    };

    const allocation = allocator.allocate(context);

    expect(allocation.maxRiskDiscrepancy).toBeLessThanOrEqual(1e-4);
    expect(allocation.cashBufferRatio).toBeGreaterThanOrEqual(0.20);
    // Arbitrage with positive Sharpe should receive significantly higher allocation than distressed marl/alpha-lab
    expect(allocation.allocatedCapitalUsd.arbitrage).toBeGreaterThan(allocation.allocatedCapitalUsd.marl);
  });

  it('updates configuration and respects customized buffer ratios', () => {
    const allocator = new PortfolioAllocator({ minCashBufferRatio: 0.20 });
    expect(allocator.getConfig().minCashBufferRatio).toBe(0.20);

    allocator.updateConfig({ minCashBufferRatio: 0.30 });
    expect(allocator.getConfig().minCashBufferRatio).toBe(0.30);

    const context: AllocationContext = {
      totalNavUsd: 100000,
      currentAllocations: { arbitrage: 15000, marl: 15000, amm: 15000, 'alpha-lab': 15000 },
      lockedCapital: { arbitrage: 1000, marl: 1000, amm: 1000, 'alpha-lab': 1000 },
      regime: 'RANGING',
      performance: makePerformance(1.0, 1.0),
    };

    const alloc = allocator.allocate(context);
    expect(alloc.cashBufferRatio).toBeGreaterThanOrEqual(0.30);
    expect(alloc.unallocatedCashUsd).toBeCloseTo(30000, 2);
  });
});
