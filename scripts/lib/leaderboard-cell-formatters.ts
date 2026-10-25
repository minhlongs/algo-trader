/**
 * Cell formatters and shared labels for the leaderboard tables.
 *
 * Kept separate so the table builder and the doc assembler can both use them
 * without importing each other (which would be a cycle).
 */

import type { LeaderboardCsvRow } from './leaderboard-csv-source.ts';

/** Rows with this many trades are reported as insufficient, never ranked. */
export const MIN_SAMPLE_TRADES = 1;

/** Statistical significance threshold for backtest sample size. */
export const STATISTICALLY_SIGNIFICANT_TRADES = 30;

/** Label for ranked rows with 1..29 trades (< 30 statistical threshold). */
export const SMALL_SAMPLE_WARNING_LABEL = 'INSUFFICIENT_SAMPLE (<30)';

/** Label for zero-trade rows in machine/status representation. */
export const NO_TRADES_LABEL = 'NO_TRADES';

/** Profit factor printed when the CSV has a zero-loss strategy on a tiny sample. */
export const INFINITE_PF_LABEL = 'n/a — profit factor vô hạn trên mẫu quá nhỏ';

/** Copy for rows that carry no trades and therefore no measurable performance. */
export const INSUFFICIENT_LABEL = 'không đủ dữ liệu';

export interface RankedRow extends LeaderboardCsvRow {
  rank: number;
}

export type { LeaderboardCsvRow };

/** Fixed-point without thousands separators and without ever printing `Infinity`. */
export function fixed(value: number, digits: number): string {
  return Number.isFinite(value) ? value.toFixed(digits) : INSUFFICIENT_LABEL;
}

/** Sample-size cell with explicit INSUFFICIENT_SAMPLE (<30) flag when trades < 30. */
export function sampleSizeCell(totalTrades: number): string {
  if (totalTrades <= 0) return `${totalTrades} (${NO_TRADES_LABEL})`;
  if (totalTrades < STATISTICALLY_SIGNIFICANT_TRADES) {
    return `${totalTrades} (${SMALL_SAMPLE_WARNING_LABEL})`;
  }
  return `${totalTrades}`;
}

/** Profit factor cell — explicit about the infinite case, never the literal string. */
export function profitFactorCell(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : INFINITE_PF_LABEL;
}

/** Sharpe cell for a ranked row; negative values keep their sign. */
export function sharpeCell(value: number): string {
  return fixed(value, 2);
}
