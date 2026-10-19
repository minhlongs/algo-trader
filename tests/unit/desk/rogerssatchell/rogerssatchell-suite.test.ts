import { describe, it, expect } from 'vitest';
import { RogersSatchellEngine } from '../../../../src/desk/rogerssatchell/rogerssatchell-engine.js';
import { RogersSatchellBar } from '../../../../src/desk/rogerssatchell/rogerssatchell-types.js';

describe('RogersSatchellEngine (1991 Non-Zero Drift Range Volatility)', () => {
  const sampleBars: RogersSatchellBar[] = [
    { open: 100, high: 106, low: 98, close: 104 },
    { open: 104, high: 108, low: 102, close: 103 },
    { open: 103, high: 105, low: 99, close: 101 },
    { open: 101, high: 104, low: 97, close: 102 },
    { open: 102, high: 107, low: 101, close: 106 },
  ];

  it('validates OHLC bars strictly', () => {
    expect(() => RogersSatchellEngine.validateBars([])).toThrow();
    expect(() => RogersSatchellEngine.validateBars([{ open: 100, high: 95, low: 90, close: 92 }])).toThrow();
    expect(() => RogersSatchellEngine.validateBars([{ open: 100, high: 105, low: 102, close: 100 }])).toThrow();
    expect(() => RogersSatchellEngine.validateBars([{ open: 100, high: 105, low: 95, close: -5 }])).toThrow();
  });

  it('computes Rogers-Satchell volatility accurately', () => {
    const res = RogersSatchellEngine.estimate(sampleBars, { annualizationFactor: 252 });

    expect(res.rogersSatchellVol).toBeGreaterThan(0.20);
    expect(res.rogersSatchellVol).toBeLessThan(0.90);
    expect(res.classicalCloseToCloseVol).toBeGreaterThan(0.10);
    expect(res.sampleSize).toBe(5);
    expect(res.efficiencyRatio).toBe(6.0);
  });

  it('handles zero intra-bar range flat prices gracefully', () => {
    const flatBars: RogersSatchellBar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
    ];
    const res = RogersSatchellEngine.estimate(flatBars);
    expect(res.rogersSatchellVol).toBe(0);
    expect(res.classicalCloseToCloseVol).toBe(0);
  });

  it('scales properly with annualization factors', () => {
    const resDaily = RogersSatchellEngine.estimate(sampleBars, { annualizationFactor: 252 });
    const resCrypto = RogersSatchellEngine.estimate(sampleBars, { annualizationFactor: 365 });

    const expectedRatio = Math.sqrt(365 / 252);
    expect(resCrypto.rogersSatchellVol / resDaily.rogersSatchellVol).toBeCloseTo(expectedRatio, 4);
  });
});
