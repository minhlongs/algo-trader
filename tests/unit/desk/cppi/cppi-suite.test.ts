import { describe, it, expect } from 'vitest';
import { CppiSimulationEngine } from '../../../../src/desk/cppi/cppi-simulation-engine';
import { CppiParameters } from '../../../../src/desk/cppi/cppi-types';

describe('CPPI & Dynamic Floor Portfolio Insurance Desk Suite', () => {
  it('protects portfolio floor during severe market drawdown', () => {
    const engine = new CppiSimulationEngine();

    const params: CppiParameters = {
      initialPortfolioValueUsd: 1000000,
      floorGuaranteeFraction: 0.90, // 90% floor ($900k)
      multiplierM: 3.0,
      riskFreeRatePct: 4.0,
      timeHorizonYears: 1.0,
    };

    // Heavy drawdown path: -5% per step for 6 steps
    const drawdownReturns = [-0.05, -0.05, -0.06, -0.04, -0.05, -0.03];

    const sim = engine.simulateStrategy(params, drawdownReturns, 0.05);

    // Final portfolio should respect floor protection
    expect(sim.finalPortfolioValueUsd).toBeGreaterThanOrEqual(850000);
    // Risky allocation should progressively de-lever
    const firstState = sim.states[0]!;
    const lastState = sim.states[sim.states.length - 1]!;
    expect(firstState.riskyAllocationUsd).toBeGreaterThan(lastState.riskyAllocationUsd);
  });

  it('captures upside equity leverage during bull market', () => {
    const engine = new CppiSimulationEngine();

    const params: CppiParameters = {
      initialPortfolioValueUsd: 1000000,
      floorGuaranteeFraction: 0.85,
      multiplierM: 4.0,
      riskFreeRatePct: 3.0,
      timeHorizonYears: 1.0,
    };

    // Strong bull path
    const bullReturns = [0.03, 0.04, 0.02, 0.05, 0.03];
    const sim = engine.simulateStrategy(params, bullReturns, 0.05);

    expect(sim.finalPortfolioValueUsd).toBeGreaterThan(params.initialPortfolioValueUsd * 1.10);
    expect(sim.minimumObservedCushionUsd).toBeGreaterThan(0);
  });
});
