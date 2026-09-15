/**
 * Shared test fixtures and return series generators for portfolio correlation tests.
 */

/** Deterministic sine-wave returns for repeatable tests. */
export function makeReturns(n: number, amplitude = 0.03, offset = 0): number[] {
  return Array.from({ length: n }, (_, i) => offset + amplitude * Math.sin((2 * Math.PI * i) / n));
}
