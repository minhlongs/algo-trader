import { describe, it, expect } from 'vitest';
import { CrankEngine } from '../../../../src/desk/cranknicolson/crank-engine.js';
import { CrankOptionParams } from '../../../../src/desk/cranknicolson/crank-types.js';

describe('Crank-Nicolson Finite Difference American Option Engine', () => {
  const baseCall: CrankOptionParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    volatility: 0.20,
    isCall: true,
    isAmerican: false,
    gridStepsS: 150,
    gridStepsT: 150,
  };

  it('prices European call within standard Black-Scholes tolerance', () => {
    const res = CrankEngine.price(baseCall);
    expect(res.price).toBeGreaterThan(8.0);
    expect(res.price).toBeLessThan(11.0);
    expect(res.earlyExercisePremium).toBe(0);
  });

  it('generates non-negative early exercise premium for American put options', () => {
    const americanPut: CrankOptionParams = {
      ...baseCall,
      isCall: false,
      isAmerican: true,
    };
    const res = CrankEngine.price(americanPut);
    expect(res.price).toBeGreaterThan(0);
    expect(res.earlyExercisePremium).toBeGreaterThanOrEqual(0);
  });

  it('ensures American option price never falls below intrinsic value', () => {
    const itmPut: CrankOptionParams = {
      ...baseCall,
      spot: 70,
      strike: 100,
      isCall: false,
      isAmerican: true,
    };
    const res = CrankEngine.price(itmPut);
    expect(res.price).toBeGreaterThanOrEqual(30.0); // Strike - Spot = 30
  });

  it('computes consistent finite difference Greeks', () => {
    const res = CrankEngine.price(baseCall);
    expect(res.greeks.delta).toBeGreaterThan(0.5);
    expect(res.greeks.delta).toBeLessThan(0.7);
    expect(res.greeks.gamma).toBeGreaterThan(0);
    expect(res.greeks.vega).toBeGreaterThan(0);
  });

  it('validates strictly positive financial parameters', () => {
    expect(() => CrankEngine.price({ ...baseCall, spot: -5 })).toThrow(/strictly positive/);
    expect(() => CrankEngine.price({ ...baseCall, strike: 0 })).toThrow(/strictly positive/);
    expect(() => CrankEngine.price({ ...baseCall, volatility: -0.1 })).toThrow(/strictly positive/);
  });
});
