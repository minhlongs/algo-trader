import { describe, it, expect } from 'vitest';
import { GarmanKlassEngine } from '../../../../src/desk/garmanklass/garmanklass-engine.js';
import { OHLCBar } from '../../../../src/desk/garmanklass/garmanklass-types.js';

describe('GarmanKlassEngine (1980 Range Volatility)', () => {
  const sampleBars: OHLCBar[] = [
    { open: 100, high: 105, low: 98, close: 103 },
    { open: 103, high: 107, low: 101, close: 102 },
    { open: 102, high: 104, low: 99, close: 100 },
    { open: 100, high: 103, low: 97, close: 101 },
    { open: 101, high: 106, low: 100, close: 105 },
  ];

  it('validates OHLC bars strictly', () => {
    expect(() => GarmanKlassEngine.validateBars([])).toThrow();
    expect(() => GarmanKlassEngine.validateBars([{ open: 100, high: 90, low: 95, close: 100 }])).toThrow();
    expect(() => GarmanKlassEngine.validateBars([{ open: 100, high: 105, low: 102, close: 100 }])).toThrow();
    expect(() => GarmanKlassEngine.validateBars([{ open: 100, high: 105, low: 95, close: -1 }])).toThrow();
  });

  it('computes Parkinson and Garman-Klass volatility estimates accurately', () => {
    const res = GarmanKlassEngine.estimate(sampleBars, { annualizationFactor: 252 });

    expect(res.parkinsonVol).toBeGreaterThan(0);
    expect(res.garmanKlassVol).toBeGreaterThan(0);
    expect(res.classicalCloseToCloseVol).toBeGreaterThan(0);

    // Volatilities should fall in realistic ranges (~20% to ~90%)
    expect(res.parkinsonVol).toBeGreaterThan(0.20);
    expect(res.parkinsonVol).toBeLessThan(0.90);
    expect(res.garmanKlassVol).toBeGreaterThan(0.20);
    expect(res.garmanKlassVol).toBeLessThan(0.90);

    expect(res.sampleSize).toBe(5);
    expect(res.annualizationFactor).toBe(252);
    expect(res.parkinsonEfficiencyRatio).toBe(5.2);
    expect(res.garmanKlassEfficiencyRatio).toBe(7.4);
  });

  it('handles flat prices (zero intra-bar range) gracefully', () => {
    const flatBars: OHLCBar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 100, high: 100, low: 100, close: 100 },
    ];
    const res = GarmanKlassEngine.estimate(flatBars);
    expect(res.parkinsonVol).toBe(0);
    expect(res.garmanKlassVol).toBe(0);
    expect(res.classicalCloseToCloseVol).toBe(0);
  });

  it('supports custom annualization factor', () => {
    const resDaily = GarmanKlassEngine.estimate(sampleBars, { annualizationFactor: 252 });
    const resCrypto = GarmanKlassEngine.estimate(sampleBars, { annualizationFactor: 365 });

    // Scaling by sqrt(365 / 252)
    const expectedRatio = Math.sqrt(365 / 252);
    expect(resCrypto.parkinsonVol / resDaily.parkinsonVol).toBeCloseTo(expectedRatio, 4);
    expect(resCrypto.garmanKlassVol / resDaily.garmanKlassVol).toBeCloseTo(expectedRatio, 4);
  });
});
