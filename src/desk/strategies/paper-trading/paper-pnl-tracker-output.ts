/**
 * Paper PnL Tracker — Prometheus Export and Log Report
 *
 * Submodule extracted from paper-pnl-tracker.ts to keep files under 200 lines.
 * Contains the Prometheus text format builder and human-readable log report.
 */

import { logger } from '../../../shared/utils/logger';
import { PnlSummary } from './paper-pnl-tracker-computation';

export function buildPrometheusExport(summary: PnlSummary, unrealized: number, openPositionCount: number): string {
  const at = summary.allTime;
  const lines: string[] = [];

  lines.push('# HELP paper_trading_balance Current paper account balance (USD)');
  lines.push('# TYPE paper_trading_balance gauge');
  lines.push(`paper_trading_balance ${at.equity.toFixed(2)}`);

  lines.push('# HELP paper_trading_equity Current equity (balance + unrealized P&L)');
  lines.push('# TYPE paper_trading_equity gauge');
  lines.push(`paper_trading_equity ${at.equity.toFixed(2)}`);

  lines.push('# HELP paper_trading_realized_pnl_total Total realized P&L (USD)');
  lines.push('# TYPE paper_trading_realized_pnl_total counter');
  lines.push(`paper_trading_realized_pnl_total ${at.pnl.toFixed(2)}`);

  lines.push('# HELP paper_trading_unrealized_pnl Current unrealized P&L (USD)');
  lines.push('# TYPE paper_trading_unrealized_pnl gauge');
  lines.push(`paper_trading_unrealized_pnl ${unrealized.toFixed(2)}`);

  lines.push('# HELP paper_trading_win_rate Win rate percentage (0-100)');
  lines.push('# TYPE paper_trading_win_rate gauge');
  lines.push(`paper_trading_win_rate ${at.winRate.toFixed(2)}`);

  lines.push('# HELP paper_trading_total_trades Total number of closed trades');
  lines.push('# TYPE paper_trading_total_trades counter');
  lines.push(`paper_trading_total_trades ${at.tradeCount}`);

  lines.push('# HELP paper_trading_profit_factor Profit factor (wins / losses)');
  lines.push('# TYPE paper_trading_profit_factor gauge');
  lines.push(`paper_trading_profit_factor ${at.profitFactor === Infinity ? '1' : at.profitFactor.toFixed(4)}`);

  lines.push('# HELP paper_trading_sharpe_ratio Annualized Sharpe ratio');
  lines.push('# TYPE paper_trading_sharpe_ratio gauge');
  lines.push(`paper_trading_sharpe_ratio ${at.sharpeRatio.toFixed(4)}`);

  lines.push('# HELP paper_trading_max_drawdown Maximum drawdown (0-1)');
  lines.push('# TYPE paper_trading_max_drawdown gauge');
  lines.push(`paper_trading_max_drawdown ${at.maxDrawdown.toFixed(4)}`);

  lines.push('# HELP paper_trading_open_positions Number of open positions');
  lines.push('# TYPE paper_trading_open_positions gauge');
  lines.push(`paper_trading_open_positions ${openPositionCount}`);

  lines.push('# HELP paper_trading_daily_pnl Daily P&L (USD)');
  lines.push('# TYPE paper_trading_daily_pnl gauge');
  for (const d of summary.daily) {
    const day = new Date(d.startMs).toISOString().split('T')[0] ?? '';
    lines.push(`paper_trading_daily_pnl{period="${day}"} ${d.pnl.toFixed(2)}`);
  }

  lines.push('# HELP paper_trading_weekly_pnl Weekly P&L (USD)');
  lines.push('# TYPE paper_trading_weekly_pnl gauge');
  for (const w of summary.weekly) {
    lines.push(`paper_trading_weekly_pnl{period="${w.label}"} ${w.pnl.toFixed(2)}`);
  }

  lines.push('# HELP paper_trading_monthly_pnl Monthly P&L (USD)');
  lines.push('# TYPE paper_trading_monthly_pnl gauge');
  for (const m of summary.monthly) {
    lines.push(`paper_trading_monthly_pnl{period="${m.label}"} ${m.pnl.toFixed(2)}`);
  }

  return lines.join('\n') + '\n';
}

export function logPnlReport(summary: PnlSummary): void {
  const at = summary.allTime;
  logger.info('═══════════════════════════════════════');
  logger.info('  Paper Trading P&L Report');
  logger.info('═══════════════════════════════════════');
  logger.info(`  Balance:    $${at.balance.toFixed(2)}`);
  logger.info(`  Equity:     $${at.equity.toFixed(2)}`);
  logger.info(`  Realized:   $${at.pnl.toFixed(2)}`);
  logger.info(`  Win Rate:   ${at.winRate.toFixed(1)}%`);
  logger.info(`  Trades:     ${at.tradeCount} (${at.winCount}W / ${at.lossCount}L)`);
  logger.info(`  Profit Factor: ${at.profitFactor === Infinity ? '∞' : at.profitFactor.toFixed(2)}`);
  logger.info(`  Sharpe:     ${at.sharpeRatio.toFixed(2)}`);
  logger.info(`  Max DD:     ${(at.maxDrawdown * 100).toFixed(2)}%`);
  logger.info('───────────────────────────────────────');
  if (summary.daily.length > 0) {
    const d = summary.daily[0]!;
    logger.info(`  Today:      $${d.pnl.toFixed(2)} (${d.tradeCount} trades)`);
  }
  if (summary.weekly.length > 0) {
    const w = summary.weekly[0]!;
    logger.info(`  This Week:  $${w.pnl.toFixed(2)} (${w.tradeCount} trades)`);
  }
  if (summary.monthly.length > 0) {
    const m = summary.monthly[0]!;
    logger.info(`  This Month: $${m.pnl.toFixed(2)} (${m.tradeCount} trades)`);
  }
  logger.info('═══════════════════════════════════════');
}
