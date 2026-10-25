/**
 * Cell formatters and shared labels for the leaderboard tables.
 *
 * Kept separate so the table builder and the doc assembler can both use them
 * without importing each other (which would be a cycle).
 */

import type { LeaderboardCsvRow } from './leaderboard-csv-source.ts';

/** Rows with this many trades are reported as insufficient, never ranked. */
export const MIN_SAMPLE_TRADES = 1;

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

/** Profit factor cell — explicit about the infinite case, never the literal string. */
export function profitFactorCell(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : INFINITE_PF_LABEL;
}

/** Sharpe cell for a ranked row; negative values keep their sign. */
export function sharpeCell(value: number): string {
  return fixed(value, 2);
}
