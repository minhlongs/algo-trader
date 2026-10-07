/**
 * MinBTL Gating
 *
 * Enforces Minimum Backtest Length (MinBTL) to ensure statistical significance.
 */
import type { WalkForwardSummary } from '../walkforward/walkforward-types';

export interface MinBTLConfig {
  minBars: number;
  minTrades: number;
}

export function validateMinBTL(summary: WalkForwardSummary, config: MinBTLConfig): boolean {
  // Check total bars used in test (or similar proxy)
  const isBarsValid = summary.cumulativeEquity.length >= config.minBars;
  // Summary might not have trade count directly if it's derived,
  // but if we have trades passed, check them.
  const isTradesValid = (summary.totalTestTrades ?? 0) >= config.minTrades;

  return isBarsValid && isTradesValid;
}
