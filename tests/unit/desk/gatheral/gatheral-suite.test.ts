import { describe, it, expect } from 'vitest';
import { GatheralEngine } from '../../../../src/desk/gatheral/gatheral-engine';
import { GatheralParams } from '../../../../src/desk/gatheral/gatheral-types';

describe('Desk 134: Gatheral (2010) No-Dynamic-Arbitrage Transient Impact Engine', () => {
  const linearParams: GatheralParams = {
    initialPrice: 100.0,
    totalQuantity: 1000.0,
    tradingHorizon: 1.0,
    numSteps: 10,
    impactPower: 1.0,     // Linear impact
    impactCoeff: 0.001,
    kernel: {
      kernelType: 'exponential',
      gamma: 1.0,
      decayParam: 2.0,    // rho = 2.0
    },
  };

  it('confirms linear impact is arbitrage-free with zero or negative round-trip PnL', () => {
    const res = GatheralEngine.simulate(linearParams);

    expect(res.totalCost).toBeGreaterThan(0.0);
    expect(res.averageExecutionPrice).toBeGreaterThan(linearParams.initialPrice);
    expect(res.slippageVsInitial).toBeGreaterThan(0.0);
    // Linear impact with exponential decay: round-trip trading generates no profit
    expect(res.hasDynamicArbitrage).toBe(false);
    expect(res.roundTripPnL).toBeLessThanOrEqual(1e-4);
  });

  it('detects dynamic price manipulation arbitrage under sub-linear power impact', () => {
    // Gatheral (2010): delta < 1 allows round-trip arbitrage (buy fast, sell slow)
    const nonLinearParams: GatheralParams = {
      ...linearParams,
      impactPower: 0.5,    // Square root impact
      impactCoeff: 0.05,
    };
    const res = GatheralEngine.simulate(nonLinearParams);

    // Fast buy pushes price less per share than slow sell recovers, yielding round-trip profit
    expect(res.roundTripPnL).toBeGreaterThan(0.0);
    expect(res.hasDynamicArbitrage).toBe(true);
  });

  it('supports power-law decay kernel and exhibits transient memory', () => {
    const powerLawParams: GatheralParams = {
      ...linearParams,
      kernel: {
        kernelType: 'power-law',
        gamma: 1.0,
        decayParam: 0.6,   // alpha = 0.6
        timeScale: 0.5,
      },
    };
    const res = GatheralEngine.simulate(powerLawParams);

    expect(res.steps.length).toBe(10);
    expect(res.terminalImpact).toBeGreaterThan(0.0);
    expect(res.steps[9].accumulatedImpact).toBeGreaterThan(0.0);
  });

  it('demonstrates faster decay reduces total execution slippage', () => {
    const slowDecay = GatheralEngine.simulate({
      ...linearParams,
      kernel: { kernelType: 'exponential', gamma: 1.0, decayParam: 0.5 },
    });
    const fastDecay = GatheralEngine.simulate({
      ...linearParams,
      kernel: { kernelType: 'exponential', gamma: 1.0, decayParam: 10.0 },
    });

    expect(fastDecay.slippageVsInitial).toBeLessThan(slowDecay.slippageVsInitial);
    expect(fastDecay.totalCost).toBeLessThan(slowDecay.totalCost);
  });

  it('validates invalid parameters and throws descriptive errors', () => {
    expect(() => GatheralEngine.simulate({ ...linearParams, initialPrice: 0 })).toThrow(/Invalid initialPrice/);
    expect(() => GatheralEngine.simulate({ ...linearParams, totalQuantity: -5 })).toThrow(/Invalid totalQuantity/);
    expect(() => GatheralEngine.simulate({ ...linearParams, numSteps: 1 })).toThrow(/Invalid numSteps/);
    expect(() => GatheralEngine.simulate({ ...linearParams, impactPower: 1.5 })).toThrow(/Invalid impactPower/);
    expect(() => GatheralEngine.simulate({ ...linearParams, impactPower: 0 })).toThrow(/Invalid impactPower/);
  });
});
