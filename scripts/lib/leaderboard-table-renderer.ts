/**
 * Markdown table builders for the leaderboard doc.
 *
 * Split out of `leaderboard-doc-renderer.ts` to keep both modules small and
 * single-purpose: this file turns rows into table text, that file assembles the
 * bilingual prose around them.
 */

import {
  INSUFFICIENT_LABEL,
  NO_TRADES_LABEL,
  fixed,
  profitFactorCell,
  sampleSizeCell,
  sharpeCell,
  type LeaderboardCsvRow,
  type RankedRow,
} from './leaderboard-cell-formatters.ts';

/** Ranked strategies, best Sharpe first, with the sample size always visible. */
export function renderRankedTable(ranked: RankedRow[]): string {
  const header = [
    '| Rank / Hạng | Strategy / Chiến lược | Sharpe | Max Drawdown | Win Rate | Total Trades / Cỡ mẫu | Profit Factor | P&L (USD) |',
    '|:---:|:---|:---:|:---:|:---:|:---:|:---:|:---:|',
  ];

  const rows = ranked.map((row) =>
    [
      '',
      row.rank,
      `\`${row.strategy}\``,
      sharpeCell(row.sharpe_ratio),
      `-${fixed(row.max_drawdown_pct, 2)}%`,
      `${fixed(row.win_rate_pct, 2)}%`,
      sampleSizeCell(row.total_trades),
      profitFactorCell(row.profit_factor),
      fixed(row.total_pnl_usd, 2),
    ].join(' | ') + ' |',
  );

  return [...header, ...rows].join('\n');
}

/** Strategies with zero trades — listed, labelled, and never given a rank. */
export function renderInsufficientTable(insufficient: LeaderboardCsvRow[]): string {
  const header = [
    '| Strategy / Chiến lược | Total Trades / Cỡ mẫu | Status / Trạng thái |',
    '|:---|:---:|:---|',
  ];

  const rows = insufficient.map(
    (row) => `| \`${row.strategy}\` | ${row.total_trades} | ${INSUFFICIENT_LABEL} (${NO_TRADES_LABEL}) |`,
  );

  return [...header, ...rows].join('\n');
}
