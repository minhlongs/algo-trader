import { describe, it, expect } from 'vitest';
import { runMonteCarloPermutation } from '../monte-carlo-permutation';
import { mulberry32 } from '../validation-types';

// ── Fixtures (computed, not hardcoded metrics) ───────────────────────────────

/** Skilled path: wins arrive early, losses late — extremal ordering. */
function goodPathPnls(): number[] {
  return [
    ...Array.from({ length: 40 }, () => 10),
    ...Array.from({ length: 20 }, () => -5),
  ];
}

/** Same trade multiset as goodPathPnls but worst-case ordering. */
function badPathPnls(): number[] {
  return [...goodPathPnls()].reverse();
}

/** Seeded zero-drift random PnLs — a strategy with no edge. */
function randomPnls(seed: number, n = 60): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => (rng() < 0.5 ? 10 : -10));
}

const BASE = { initialCapital: 1000, nSimulations: 500, seed: 42 };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runMonteCarloPermutation', () => {
  it('gives a low Sharpe p-value for a genuinely good path', () => {
    const result = runMonteCarloPermutation(goodPathPnls(), BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actualSharpe).toBeGreaterThan(0);
    expect(result.pValueSharpe).toBeLessThan(0.05);
    // A shallow observed drawdown is not beatable by random orderings, so
    // the max-drawdown p-value is high (not significant) — that is correct.
    expect(result.actualMaxDrawdown).toBeGreaterThan(-0.15);
    expect(result.pValueMaxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.pValueMaxDrawdown).toBeLessThanOrEqual(1);
  });

  it('gives a high Sharpe p-value for a path ordered worse than random', () => {
    const result = runMonteCarloPermutation(badPathPnls(), BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pValueSharpe).toBeGreaterThan(0.5);
  });

  it('produces a valid p-value for a seeded random-order strategy', () => {
    const result = runMonteCarloPermutation(randomPnls(123), BASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pValueSharpe).toBeGreaterThanOrEqual(0);
    expect(result.pValueSharpe).toBeLessThanOrEqual(1);
  });

  it('is deterministic: same seed twice yields identical results', () => {
    const pnls = randomPnls(99);
    const first = runMonteCarloPermutation(pnls, { ...BASE, seed: 7 });
    const second = runMonteCarloPermutation(pnls, { ...BASE, seed: 7 });
    expect(second).toEqual(first);
  });

  it('reports consistent percentiles and counts', () => {
    const result = runMonteCarloPermutation(goodPathPnls(), BASE);
    if (!result.ok) throw new Error('expected success');
    expect(result.simulatedSharpeP5).toBeLessThanOrEqual(result.simulatedSharpeMean);
    expect(result.simulatedSharpeMean).toBeLessThanOrEqual(result.simulatedSharpeP95);
    expect(result.simulatedSharpeStd).toBeGreaterThanOrEqual(0);
    expect(result.nTrades).toBe(60);
    expect(result.nSimulations).toBe(500);
    expect(result.actualMaxDrawdown).toBeLessThanOrEqual(0);
  });

  it('does not mutate the input PnL array', () => {
    const pnls = goodPathPnls();
    const copy = [...pnls];
    runMonteCarloPermutation(pnls, BASE);
    expect(pnls).toEqual(copy);
  });

  // ── Edge cases: error objects, never throws ────────────────────────────────

  it('returns an error object for fewer than 3 trades', () => {
    const result = runMonteCarloPermutation([10, -5], BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('at least 3 trades');
    expect(result.pValueSharpe).toBe(1);
  });

  it('returns an error object for an empty PnL list', () => {
    const result = runMonteCarloPermutation([], BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.pValueSharpe).toBe(1);
  });

  it('returns an error object for nSimulations = 0', () => {
    const result = runMonteCarloPermutation(goodPathPnls(), { ...BASE, nSimulations: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('nSimulations');
    expect(result.pValueSharpe).toBe(1);
  });

  it('returns an error object for negative or fractional nSimulations', () => {
    expect(
      runMonteCarloPermutation(goodPathPnls(), { ...BASE, nSimulations: -5 }).ok,
    ).toBe(false);
    expect(
      runMonteCarloPermutation(goodPathPnls(), { ...BASE, nSimulations: 10.5 }).ok,
    ).toBe(false);
  });

  it('returns an error object for a negative seed', () => {
    const result = runMonteCarloPermutation(goodPathPnls(), { ...BASE, seed: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('seed');
  });

  it('returns an error object for non-positive initial capital', () => {
    expect(
      runMonteCarloPermutation(goodPathPnls(), { ...BASE, initialCapital: 0 }).ok,
    ).toBe(false);
    expect(
      runMonteCarloPermutation(goodPathPnls(), { ...BASE, initialCapital: -100 }).ok,
    ).toBe(false);
  });

  it('returns an error object when a PnL value is not finite', () => {
    const result = runMonteCarloPermutation([10, NaN, -5], BASE);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('finite');
  });
});
