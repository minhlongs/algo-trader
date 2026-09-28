import { describe, it, expect } from 'vitest';
import {
  PerformanceTiltEngine,
  computeSharpe,
  computeSortino,
  REGIME_AFFINITY_MATRIX,
} from '../../../src/desk/portfolio/performance-tilt';
import { ENGINE_IDS, EngineId, StrategyPerformance } from '../../../src/desk/portfolio/types';

describe('Performance Tilt Engine (Rolling Sharpe/Sortino & Regime Alignment)', () => {
  it('computes rolling Sharpe and Sortino ratios correctly', () => {
    // Strategy with consistently positive returns
    const posReturns = [0.01, 0.012, 0.008, 0.015, 0.011, 0.009];
    const sharpePos = computeSharpe(posReturns, 0.04, 365);
    const sortinoPos = computeSortino(posReturns, 0.04, 365);

    expect(sharpePos).toBeGreaterThan(0);
    expect(sortinoPos).toBeGreaterThan(0);

    // Strategy with heavy downside returns has lower Sortino than Sharpe
    const mixedReturns = [0.02, -0.05, 0.03, -0.04, 0.01, -0.03];
    const sharpeMixed = computeSharpe(mixedReturns, 0.04, 365);
    const sortinoMixed = computeSortino(mixedReturns, 0.04, 365);

    expect(sharpeMixed).toBeLessThan(0);
    expect(sortinoMixed).toBeLessThan(0);
  });

  it('favors arbitrage and alpha-lab in HIGH_VOLATILITY regime', () => {
    const tiltEngine = new PerformanceTiltEngine();
    const neutralPerf: Record<EngineId, StrategyPerformance> = {
      arbitrage: { engineId: 'arbitrage', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
      marl: { engineId: 'marl', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
      amm: { engineId: 'amm', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
      'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
    };

    const budgets = tiltEngine.computeTiltedBudgets(neutralPerf, 'HIGH_VOLATILITY');

    // In HIGH_VOLATILITY, arbitrage affinity is 1.35 and marl is 0.65
    expect(budgets.arbitrage).toBeGreaterThan(budgets.marl);
    expect(budgets['alpha-lab']).toBeGreaterThan(budgets.amm);
  });

  it('favors marl and amm in RANGING regime', () => {
    const tiltEngine = new PerformanceTiltEngine();
    const neutralPerf: Record<EngineId, StrategyPerformance> = {
      arbitrage: { engineId: 'arbitrage', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
      marl: { engineId: 'marl', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
      amm: { engineId: 'amm', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
      'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1.0, rollingSortino: 1.0, rollingVolatility: 0.1, totalPnlUsd: 100 },
    };

    const budgets = tiltEngine.computeTiltedBudgets(neutralPerf, 'RANGING');

    // In RANGING, marl affinity is 1.40 and amm is 1.20
    expect(budgets.marl).toBeGreaterThan(budgets.arbitrage);
    expect(budgets.amm).toBeGreaterThan(budgets['alpha-lab']);
  });

  it('strictly bounds tilted risk budgets within [0.05, 0.50] and sums to 1.0', () => {
    const tiltEngine = new PerformanceTiltEngine({
      minRiskBudget: 0.05,
      maxRiskBudget: 0.50,
      gammaTilt: 0.5,
    });

    // Extreme performance disparity
    const extremePerf: Record<EngineId, StrategyPerformance> = {
      arbitrage: { engineId: 'arbitrage', rollingSharpe: 10.0, rollingSortino: 12.0, rollingVolatility: 0.05, totalPnlUsd: 1000 },
      marl: { engineId: 'marl', rollingSharpe: -5.0, rollingSortino: -6.0, rollingVolatility: 0.5, totalPnlUsd: -500 },
      amm: { engineId: 'amm', rollingSharpe: -5.0, rollingSortino: -6.0, rollingVolatility: 0.5, totalPnlUsd: -500 },
      'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: -5.0, rollingSortino: -6.0, rollingVolatility: 0.5, totalPnlUsd: -500 },
    };

    const budgets = tiltEngine.computeTiltedBudgets(extremePerf, 'HIGH_VOLATILITY');

    let sum = 0;
    for (const id of ENGINE_IDS) {
      expect(budgets[id]).toBeGreaterThanOrEqual(0.05 - 1e-6);
      expect(budgets[id]).toBeLessThanOrEqual(0.50 + 1e-6);
      sum += budgets[id];
    }
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-5);
  });
});
