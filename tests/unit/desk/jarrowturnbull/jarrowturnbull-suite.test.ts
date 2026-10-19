import { describe, it, expect } from 'vitest';
import { JarrowTurnbullEngine } from '../../../../src/desk/jarrowturnbull/jarrowturnbull-engine.js';
import { JarrowTurnbullConfig } from '../../../../src/desk/jarrowturnbull/jarrowturnbull-types.js';

describe('JarrowTurnbullEngine (1995 Credit Risk & Risky Debt Model)', () => {
  const baseConfig: JarrowTurnbullConfig = {
    riskFreeRate: 0.05,
    hazardRate: 0.02, // 200 bps default intensity
    recoveryRate: 0.40, // 40% standard corporate recovery
  };

  it('validates configuration strictly', () => {
    expect(() =>
      JarrowTurnbullEngine.validateConfig({
        riskFreeRate: -0.2,
        hazardRate: 0.02,
        recoveryRate: 0.4,
      })
    ).toThrow();

    expect(() =>
      JarrowTurnbullEngine.validateConfig({
        riskFreeRate: 0.05,
        hazardRate: -0.01,
        recoveryRate: 0.4,
      })
    ).toThrow();

    expect(() =>
      JarrowTurnbullEngine.validateConfig({
        riskFreeRate: 0.05,
        hazardRate: 0.02,
        recoveryRate: 1.5,
      })
    ).toThrow();

    expect(() =>
      JarrowTurnbullEngine.estimate(0, baseConfig)
    ).toThrow();
  });

  it('computes correct analytical credit metrics for 5-year maturity', () => {
    const estimates = JarrowTurnbullEngine.estimate(5.0, baseConfig);

    expect(estimates.survivalProbability).toBeCloseTo(Math.exp(-0.02 * 5), 4);
    expect(estimates.defaultProbability).toBeCloseTo(1 - Math.exp(-0.02 * 5), 4);
    expect(estimates.riskFreeDiscount).toBeCloseTo(Math.exp(-0.05 * 5), 4);
    expect(estimates.riskyBondPrice).toBeLessThan(100 * Math.exp(-0.05 * 5));
    expect(estimates.creditSpreadBps).toBeGreaterThan(100);
    expect(estimates.parCdsSpreadBps).toBeGreaterThan(100);
  });

  it('handles zero hazard rate (risk-free debt equivalent)', () => {
    const riskFreeConfig: JarrowTurnbullConfig = {
      riskFreeRate: 0.04,
      hazardRate: 0.0,
      recoveryRate: 0.4,
    };
    const estimates = JarrowTurnbullEngine.estimate(3.0, riskFreeConfig);

    expect(estimates.survivalProbability).toBe(1.0);
    expect(estimates.defaultProbability).toBe(0.0);
    expect(estimates.creditSpreadBps).toBe(0.0);
    expect(estimates.parCdsSpreadBps).toBe(0.0);
    expect(estimates.riskyBondPrice).toBeCloseTo(100 * Math.exp(-0.04 * 3), 2);
  });

  it('CDS spread closely approximates (1 - delta) * lambda', () => {
    const estimates = JarrowTurnbullEngine.estimate(5.0, baseConfig);
    const approxBps = (1 - 0.40) * 0.02 * 10000; // 120 bps
    expect(Math.abs(estimates.parCdsSpreadBps - approxBps)).toBeLessThan(10);
  });
});
