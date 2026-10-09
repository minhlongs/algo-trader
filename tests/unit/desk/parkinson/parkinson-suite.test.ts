import { describe, it, expect } from 'vitest';
import { ParkinsonEngine } from '../../../../src/desk/parkinson/parkinson-engine.js';
import { ParkinsonBar } from '../../../../src/desk/parkinson/parkinson-types.js';

describe('ParkinsonEngine (1980 Extreme Value High-Low Volatility)', () => {
  const sampleBars: ParkinsonBar[] = [
    { high: 106, low: 98 },
    { high: 108, low: 101 },
    { high: 105, low: 99 },
    { high: 104, low: 97 },
    { high: 107, low: 101 },
  ];

  it('validates bars strictly', () => {
    expect(() => ParkinsonEngine.validateBars([])).toThrow();
    expect(() => ParkinsonEngine.validateBars([{ high: 100, low: 95 }])).toThrow();
    expect(() => ParkinsonEngine.validateBars([{ high: -100, low: 95 }, { high: 105, low: 95 }])).toThrow();
    expect(() => ParkinsonEngine.validateBars([{ high: 90, low: 100 }, { high: 105, low: 95 }])).toThrow();
  });

  it('computes Parkinson volatility accurately', () => {
    const res = ParkinsonEngine.estimate(sampleBars, { annualizationFactor: 252 });

    expect(res.parkinsonVol).toBeGreaterThan(0.20);
    expect(res.parkinsonVol).toBeLessThan(1.20);
    expect(res.efficiencyGain).toBe(5.2);
    expect(res.sampleSize).toBe(5);
    expect(res.parkinsonVariance).toBeGreaterThan(0);
  });

  it('handles flat prices with zero variance', () => {
    const flatBars: ParkinsonBar[] = [
      { high: 100, low: 100 },
      { high: 100, low: 100 },
      { high: 100, low: 100 },
    ];
    const res = ParkinsonEngine.estimate(flatBars);
    expect(res.parkinsonVol).toBe(0);
    expect(res.parkinsonVariance).toBe(0);
  });

  it('scales correctly with annualization factor', () => {
    const res252 = ParkinsonEngine.estimate(sampleBars, { annualizationFactor: 252 });
    const res365 = ParkinsonEngine.estimate(sampleBars, { annualizationFactor: 365 });

    const expectedRatio = Math.sqrt(365 / 252);
    expect(res365.parkinsonVol / res252.parkinsonVol).toBeCloseTo(expectedRatio, 4);
  });
});
