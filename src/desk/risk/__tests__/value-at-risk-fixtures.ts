/**
 * Fixtures for Value-at-Risk (VaR) and CVaR tests.
 */

import type { PositionPnlInput } from '../value-at-risk';

/**
 * Generate synthetic daily returns from a simple sine wave for deterministic testing.
 */
export function makeReturns(n: number, amplitude = 0.03, offset = 0): number[] {
  return Array.from(
    { length: n },
    (_, i) => offset + amplitude * Math.sin((2 * Math.PI * i) / n),
  );
}

/**
 * Build a PositionPnlInput from its symbol, current market value, and return series.
 */
export function makePosition(
  symbol: string,
  currentValue: number,
  returns: number[],
): PositionPnlInput {
  return { symbol, currentValue, returns };
}
