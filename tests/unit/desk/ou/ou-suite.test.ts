import { describe, expect, it } from 'vitest';
import { OuStoppingEngine } from '../../../../src/desk/ou/ou-stopping-engine';

describe('OuStoppingEngine Suite', () => {
  const engine = new OuStoppingEngine();

  // Synthetic mean-reverting series around mu = 10.0 with positive autocorrelation
  const syntheticSpread = [
    10.0, 10.05, 10.02, 10.07, 10.2, 10.1, 10.04, 10.18, 10.19, 10.07, 10.09,
    10.01, 9.96, 10.0, 9.81, 9.71, 9.77, 9.76, 9.88, 9.84, 9.76, 10.0, 9.98,
    9.99, 9.85, 9.86, 9.92, 9.84, 9.94, 9.9, 9.91
  ];

  it('should calibrate continuous Ornstein-Uhlenbeck parameters from spread history', () => {
    const params = engine.fitContinuousOu(syntheticSpread, 1.0);

    expect(params.speedOfMeanReversionTheta).toBeGreaterThan(0);
    expect(params.longTermMeanMu).toBeCloseTo(10.0, 0);
    expect(params.volatilitySigma).toBeGreaterThan(0);
    expect(params.halfLifeDays).toBeGreaterThan(0);
    expect(params.stationaryVariance).toBeGreaterThan(0);
  });

  it('should generate ENTER_LONG and ENTER_SHORT signals at deviation thresholds', () => {
    const params = engine.fitContinuousOu(syntheticSpread, 1.0);

    // Deeply depressed spread -> ENTER_LONG
    const longBand = engine.computeStoppingBands(9.2, params, 2.0, 0.5);
    expect(longBand.tradeSignal).toBe('ENTER_LONG');
    expect(longBand.zScoreCurrent).toBeLessThan(-2.0);

    // Elevated spread -> ENTER_SHORT
    const shortBand = engine.computeStoppingBands(10.8, params, 2.0, 0.5);
    expect(shortBand.tradeSignal).toBe('ENTER_SHORT');
    expect(shortBand.zScoreCurrent).toBeGreaterThan(2.0);

    // Mean reversion completed -> EXIT_SPREAD
    const exitBand = engine.computeStoppingBands(params.longTermMeanMu, params, 2.0, 0.5);
    expect(exitBand.tradeSignal).toBe('EXIT_SPREAD');
  });

  it('should throw when sample size is insufficient (< 10 observations)', () => {
    const shortSeries = [1.0, 2.0, 1.5];
    expect(() => engine.fitContinuousOu(shortSeries)).toThrow('At least 10 observations required');
  });
});
