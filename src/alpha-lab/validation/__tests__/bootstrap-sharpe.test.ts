import { describe, it, expect } from 'vitest';
import { bootstrapSharpeCi } from '../bootstrap-sharpe';
import {
  mulberry32,
  mean,
  stdDev,
  percentile,
  annualizedSharpe,
} from '../validation-types';

// ── Fixtures (computed, not hardcoded metrics) ───────────────────────────────

/** Positive-drift return series with realistic noise. */
function positiveReturns(n = 120): number[] {
  const rng = mulberry32(11);
  return Array.from({ length: n }, () => 0.002 + (rng() - 0.5) * 0.02);
}

/** Negative-drift return series. */
function negativeReturns(n = 120): number[] {
  const rng = mulberry32(13);
  return Array.from({ length: n }, () => -0.002 + (rng() - 0.5) * 0.02);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('bootstrapSharpeCi', () => {
  it('produces a positive CI for a genuinely profitable series', () => {
    const result = bootstrapSharpeCi(positiveReturns());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observedSharpe).toBeGreaterThan(0);
    expect(result.ciLower).toBeGreaterThan(0);
    expect(result.ciUpper).toBeGreaterThanOrEqual(result.ciLower);
    expect(result.probPositive).toBeGreaterThan(0.95);
    expect(result.medianSharpe).toBeGreaterThanOrEqual(result.ciLower);
    expect(result.medianSharpe).toBeLessThanOrEqual(result.ciUpper);
  });

  it('produces a negative CI for a losing series', () => {
    const result = bootstrapSharpeCi(negativeReturns());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ciUpper).toBeLessThan(0);
    expect(result.probPositive).toBeLessThan(0.05);
  });

  it('uses documented defaults (1000 iterations, 95% CI, seed 42)', () => {
    const result = bootstrapSharpeCi(positiveReturns());
    if (!result.ok) throw new Error('expected success');
    expect(result.nBootstrap).toBe(1000);
    expect(result.confidence).toBe(0.95);
    expect(result.seed).toBe(42);
  });

  it('is deterministic: same seed twice yields identical results', () => {
    const returns = positiveReturns();
    const first = bootstrapSharpeCi(returns, { seed: 7 });
    const second = bootstrapSharpeCi(returns, { seed: 7 });
    expect(second).toEqual(first);
  });

  it('widens the interval as confidence rises', () => {
    const returns = positiveReturns();
    const ci90 = bootstrapSharpeCi(returns, { confidence: 0.9, seed: 5 });
    const ci99 = bootstrapSharpeCi(returns, { confidence: 0.99, seed: 5 });
    if (!ci90.ok || !ci99.ok) throw new Error('expected success');
    const width90 = ci90.ciUpper - ci90.ciLower;
    const width99 = ci99.ciUpper - ci99.ciLower;
    expect(width99).toBeGreaterThan(width90);
  });

  // ── Edge cases: error objects, never throws ────────────────────────────────

  it('returns an error for fewer than 5 return observations', () => {
    const result = bootstrapSharpeCi([0.01, 0.02, -0.01, 0.03]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('at least 5');
  });

  it('returns an error for nBootstrap = 0', () => {
    const result = bootstrapSharpeCi(positiveReturns(), { nBootstrap: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('nBootstrap');
  });

  it('returns an error for confidence outside (0, 1)', () => {
    expect(bootstrapSharpeCi(positiveReturns(), { confidence: 0 }).ok).toBe(false);
    expect(bootstrapSharpeCi(positiveReturns(), { confidence: 1 }).ok).toBe(false);
    expect(bootstrapSharpeCi(positiveReturns(), { confidence: 1.5 }).ok).toBe(false);
  });

  it('returns an error for a negative seed', () => {
    const result = bootstrapSharpeCi(positiveReturns(), { seed: -3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('seed');
  });

  it('returns an error when a return value is not finite', () => {
    const result = bootstrapSharpeCi([0.01, 0.02, NaN, 0.01, 0.03, 0.01]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('finite');
  });

  it('returns an error for non-integer nBootstrap or non-integer seed', () => {
    expect(bootstrapSharpeCi(positiveReturns(), { nBootstrap: 10.5 }).ok).toBe(false);
    expect(bootstrapSharpeCi(positiveReturns(), { seed: 1.5 }).ok).toBe(false);
    expect(bootstrapSharpeCi(positiveReturns(), { confidence: NaN }).ok).toBe(false);
  });
});

describe('validation-types primitives', () => {
  it('handles empty arrays in mean, stdDev, and percentile', () => {
    expect(mean([])).toBe(0);
    expect(stdDev([])).toBe(0);
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });

  it('handles exact boundary index in percentile', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it('computes annualizedSharpe with zero variance returns', () => {
    const flat = [0.01, 0.01, 0.01];
    const sharpe = annualizedSharpe(flat, 252);
    expect(Number.isFinite(sharpe)).toBe(true);
    expect(sharpe).toBeGreaterThan(0);
  });
});
