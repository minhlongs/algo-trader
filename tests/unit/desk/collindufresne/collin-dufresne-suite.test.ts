import { describe, it, expect } from 'vitest';
import { CollinDufresneEngine } from '../../../../src/desk/collindufresne/collin-dufresne-engine';
import { CollinDufresneMath } from '../../../../src/desk/collindufresne/collin-dufresne-math';

describe('CollinDufresneEngine — Stationary Leverage Structural Credit Suite', () => {
  it('computes stationary variance and positive credit spread for investment-grade firm', () => {
    const res = CollinDufresneEngine.calculate({
      currentLeverage: -0.8, // low debt-to-firm value
      targetLeverage: -0.6,
      reversionSpeed: 0.15,
      assetVolatility: 0.20,
      riskFreeRate: 0.04,
      recoveryRate: 0.40,
      timeHorizon: 5.0,
    });

    const expectedStatVar = (0.2 * 0.2) / (2.0 * 0.15);
    expect(res.stationaryVariance).toBeCloseTo(expectedStatVar, 6);
    expect(res.creditSpreadBps).toBeGreaterThan(0.0);
    expect(res.defaultProbability).toBeGreaterThan(0.0);
    expect(res.defaultProbability).toBeLessThan(1.0);
  });

  it('demonstrates mean-reverting leverage behavior towards target yBar', () => {
    const y0 = -1.2;
    const yBar = -0.4;
    const res = CollinDufresneEngine.calculate({
      currentLeverage: y0,
      targetLeverage: yBar,
      reversionSpeed: 0.5,
      assetVolatility: 0.25,
      riskFreeRate: 0.03,
      recoveryRate: 0.40,
      timeHorizon: 3.0,
    });

    // Leverage should mean-revert upwards from -1.2 toward -0.4
    expect(res.expectedTerminalLeverage).toBeGreaterThan(y0);
    expect(res.expectedTerminalLeverage).toBeLessThan(yBar);
  });

  it('generates downward-sloping credit spread curve for distressed firm with high leverage', () => {
    const resDistressed = CollinDufresneEngine.calculate({
      currentLeverage: 0.1, // Near or in distress
      targetLeverage: -0.5, // Target is healthier
      reversionSpeed: 0.3,
      assetVolatility: 0.22,
      riskFreeRate: 0.04,
      recoveryRate: 0.30,
      timeHorizon: 5.0,
    });

    const pts = resDistressed.termStructure;
    expect(pts.length).toBeGreaterThan(2);
    // In distress with positive reversion to safety, short-term spread is very high
    const shortTermSpread = pts[0]!.creditSpreadBps;
    const longTermSpread = pts[pts.length - 1]!.creditSpreadBps;
    expect(shortTermSpread).toBeGreaterThan(longTermSpread);
  });

  it('verifies higher recovery rate reduces credit spread', () => {
    const base = CollinDufresneEngine.calculate({
      currentLeverage: -0.5,
      targetLeverage: -0.5,
      reversionSpeed: 0.2,
      assetVolatility: 0.2,
      riskFreeRate: 0.04,
      recoveryRate: 0.30,
      timeHorizon: 3.0,
    });

    const highRecovery = CollinDufresneEngine.calculate({
      currentLeverage: -0.5,
      targetLeverage: -0.5,
      reversionSpeed: 0.2,
      assetVolatility: 0.2,
      riskFreeRate: 0.04,
      recoveryRate: 0.70,
      timeHorizon: 3.0,
    });

    expect(highRecovery.creditSpreadBps).toBeLessThan(base.creditSpreadBps);
  });

  it('throws descriptive error on invalid parameters', () => {
    expect(() =>
      CollinDufresneEngine.calculate({
        currentLeverage: -0.5,
        targetLeverage: -0.5,
        reversionSpeed: -0.1, // Invalid lambda <= 0
        assetVolatility: 0.2,
        riskFreeRate: 0.04,
        recoveryRate: 0.4,
        timeHorizon: 3.0,
      })
    ).toThrow('reversionSpeed, assetVolatility, and timeHorizon must be strictly positive');

    expect(() =>
      CollinDufresneEngine.calculate({
        currentLeverage: -0.5,
        targetLeverage: -0.5,
        reversionSpeed: 0.2,
        assetVolatility: 0.2,
        riskFreeRate: 0.04,
        recoveryRate: 1.2, // Invalid R >= 1
        timeHorizon: 3.0,
      })
    ).toThrow('recoveryRate must be in [0, 1)');
  });
});
