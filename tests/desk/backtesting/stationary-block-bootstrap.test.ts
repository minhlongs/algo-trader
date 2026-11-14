/**
 * Politis–Romano Stationary Block Bootstrap tests.
 */
import { describe, it, expect } from 'vitest';
import { stationaryBlockBootstrap } from '../../../src/desk/backtesting/stationary-block-bootstrap';

function series(length: number, fn: (i: number) => number): number[] {
  return Array.from({ length }, (_, i) => fn(i));
}

describe('stationaryBlockBootstrap', () => {
  it('produces an identical confidence interval for the same seed', () => {
    const data = series(200, (i) => Math.sin(i / 7) * 0.01 + 0.001);
    const first = stationaryBlockBootstrap(data, { seed: 1234, meanBlockLength: 8 });
    const second = stationaryBlockBootstrap(data, { seed: 1234, meanBlockLength: 8 });

    expect(second.lower).toBe(first.lower);
    expect(second.upper).toBe(first.upper);
    expect(second.median).toBe(first.median);
    expect(second.observed).toBe(first.observed);
  });

  it('produces a different interval for a different seed', () => {
    const data = series(200, (i) => Math.sin(i / 5) * 0.02);
    const a = stationaryBlockBootstrap(data, { seed: 1 });
    const b = stationaryBlockBootstrap(data, { seed: 2 });
    expect(a.lower).not.toBe(b.lower);
  });

  it('returns a CI strictly above 0 for a strictly positive constant series', () => {
    const data = series(100, () => 0.004);
    const result = stationaryBlockBootstrap(data, { seed: 7 });

    expect(result.lower).toBeCloseTo(0.004, 12);
    expect(result.upper).toBeCloseTo(0.004, 12);
    expect(result.lower).toBeGreaterThan(0);
    expect(result.observed).toBeCloseTo(0.004, 12);
  });

  it('returns a CI strictly below 0 for a series of iid negatives', () => {
    // Deterministic pseudo-iid negatives — no PRNG in the test itself.
    const data = series(250, (i) => -0.002 - ((i * 37) % 11) / 10000);
    const result = stationaryBlockBootstrap(data, { seed: 99, meanBlockLength: 5 });

    expect(result.upper).toBeLessThan(0);
    expect(result.observed).toBeLessThan(0);
    expect(result.lower).toBeLessThan(result.upper);
  });

  it('brackets the observed statistic on a noisy zero-mean series', () => {
    const data = series(400, (i) => (((i * 7919) % 101) - 50) / 10000);
    const result = stationaryBlockBootstrap(data, { seed: 42 });

    expect(result.lower).toBeLessThanOrEqual(result.observed);
    expect(result.upper).toBeGreaterThanOrEqual(result.observed);
    expect(result.confidence).toBe(0.95);
    expect(result.resamples).toBe(1000);
    expect(result.sampleLength).toBe(400);
  });

  it('widens the interval for a serially dependent series versus an iid resample', () => {
    // AR(1) with persistence 0.7: block resampling must preserve the dependence
    // and therefore yield a wider interval than shuffling single observations.
    const dependent: number[] = [0.01];
    for (let i = 1; i < 400; i++) {
      dependent.push(0.7 * dependent[i - 1] + (((i * 7919) % 101) - 50) / 10000);
    }

    const iid = stationaryBlockBootstrap(dependent, { seed: 5, meanBlockLength: 1 });
    const blocked = stationaryBlockBootstrap(dependent, { seed: 5, meanBlockLength: 5 });

    expect(blocked.upper - blocked.lower).toBeGreaterThan(iid.upper - iid.lower);
  });

  it('shrinks variability as the mean block length approaches the sample length', () => {
    // Finite-sample property: at very long block lengths a resample is close to
    // a rotation of the original series, so the interval narrows sharply (it
    // does not collapse exactly, because each resample still starts at a random
    // index).
    const data = series(400, (i) => (((i * 7919) % 101) - 50) / 10000);
    const iid = stationaryBlockBootstrap(data, { seed: 5, meanBlockLength: 1 });
    const nearlyWholeSeries = stationaryBlockBootstrap(data, { seed: 5, meanBlockLength: 400 });
    const iidWidth = iid.upper - iid.lower;
    const longWidth = nearlyWholeSeries.upper - nearlyWholeSeries.lower;

    expect(longWidth).toBeGreaterThanOrEqual(0);
    expect(longWidth).toBeLessThan(iidWidth / 4);
  });

  it('honours a custom statistic', () => {
    const data = series(120, (i) => (i % 2 === 0 ? 0.01 : -0.01));
    const result = stationaryBlockBootstrap(data, {
      seed: 3,
      statistic: (sample) => Math.max(...sample),
    });
    expect(result.observed).toBe(0.01);
    expect(result.lower).toBeLessThanOrEqual(0.01);
  });

  it('rejects empty, non-finite and out-of-range inputs', () => {
    expect(() => stationaryBlockBootstrap([])).toThrow(RangeError);
    expect(() => stationaryBlockBootstrap([0.01, Number.NaN])).toThrow(RangeError);
    expect(() => stationaryBlockBootstrap([0.01, 0.02], { resamples: 0 })).toThrow(RangeError);
    expect(() => stationaryBlockBootstrap([0.01, 0.02], { meanBlockLength: 0 })).toThrow(RangeError);
    expect(() => stationaryBlockBootstrap([0.01, 0.02], { confidence: 1 })).toThrow(RangeError);
    expect(() => stationaryBlockBootstrap([0.01, 0.02], { seed: -1 })).toThrow(RangeError);
  });
});
