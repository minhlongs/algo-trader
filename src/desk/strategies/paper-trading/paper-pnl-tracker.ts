/**
 * Paper Trading P&L Tracker
 *
 * Tracks daily/weekly/monthly P&L, calculates win rate, Sharpe ratio,
 * max drawdown. Exports metrics in Prometheus format for Grafana.
 *
 * Phase 23 — Paper Trading Analytics
 */

import { logger } from '../../../shared/utils/logger';
import { PaperExecutor, PaperTrade, getPaperExecutor } from '../../execution/paper-executor';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PnlPeriod {
  label: string;
  startMs: number;
  endMs: number;
  trades: PaperTrade[];
  pnl: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
 balance: number;
 equity: number;
}

export type DailyPnl = PnlPeriod;
export type WeeklyPnl = PnlPeriod;
export type MonthlyPnl = PnlPeriod;

export interface PnlSummary {
  daily: DailyPnl[];
  weekly: WeeklyPnl[];
  monthly: MonthlyPnl[];
  allTime: PnlPeriod;
}

export interface PrometheusMetric {
  name: string;
  type: 'gauge' | 'counter' | 'histogram';
  value: number;
  labels?: Record<string, string>;
  help?: string;
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

export class PaperPnlTracker {
  private executor: PaperExecutor;
  
  constructor(executor?: PaperExecutor) {
    this.executor = executor ?? getPaperExecutor();
  }

  /** Compute full P&L summary across all periods */
  getSummary(): PnlSummary {
    const trades = this.executor.getTradeHistory();
    const now = Date.now();
    return {
      daily: this._periods(trades, 'day', now, 30),
      weekly: this._periods(trades, 'week', now, 12),
      monthly: this._periods(trades, 'month', now, 12),
      allTime: this._allTime(trades),
    };
  }

  /** Get only the current day's P&L */
  getToday(): PnlPeriod {
    const trades = this.executor.getTradeHistory().filter((t) => {
      const d = new Date(t.timestamp);
      const now = new Date();
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth() &&
        d.getUTCDate() === now.getUTCDate()
      );
    });
    return this._buildPeriod('today', trades);
  }

  /** Get only the current week's P&L */
  getThisWeek(): PnlPeriod {
    const trades = this.executor.getTradeHistory();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);
    const filtered = trades.filter((t) => t.timestamp >= weekStart.getTime());
    return this._buildPeriod('this_week', filtered, weekStart.getTime(), now.getTime());
  }

  /** Export metrics in Prometheus text format for Grafana scraping */
  exportPrometheus(): string {
    const summary = this.getSummary();
    const at = summary.allTime;
    const _today = summary.daily[0] ?? at;
    const lines: string[] = [];

    // Help + type declarations
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
    const unrealized = this.executor.getPositions().reduce((s, p) => s + p.unrealizedPnl, 0);
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
    lines.push(`paper_trading_open_positions ${this.executor.getPositions().length}`);

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

  /** Log a human-readable report */
  logReport(): void {
    const summary = this.getSummary();
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

  // ── Private helpers ──────────────────────────────────────────────────────

  private _periods(
    trades: PaperTrade[],
    granularity: 'day' | 'week' | 'month',
    now: number,
    count: number,
  ): PnlPeriod[] {
    const buckets = new Map<string, PaperTrade[]>();
    for (const t of trades) {
      const d = new Date(t.timestamp);
      let key: string;
      if (granularity === 'day') {
        key = d.toISOString().split('T')[0] ?? '';
      } else if (granularity === 'week') {
        const weekStart = new Date(d);
        weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
        key = weekStart.toISOString().split('T')[0] ?? '';
      } else {
        key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      }
      const arr = buckets.get(key);
      if (arr) arr.push(t);
      else buckets.set(key, [t]);
    }
    const sorted = Array.from(buckets.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, count);

    return sorted.map(([label, ts]) => this._buildPeriod(label, ts));
  }

  private _allTime(trades: PaperTrade[]): PnlPeriod {
    return this._buildPeriod('all_time', trades);
  }

  private _buildPeriod(
    label: string,
    trades: PaperTrade[],
    startMs?: number,
    endMs?: number,
  ): PnlPeriod {
    const pnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
    const losses = trades.filter((t) => (t.pnl ?? 0) < 0);
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const totalWins = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    const sharpe = this._calcSharpe(trades);
    const maxDd = this._calcMaxDrawdown(trades);

    return {
      label,
      startMs: startMs ?? trades[0]?.timestamp ?? Date.now(),
      endMs: endMs ?? trades[trades.length - 1]?.timestamp ?? Date.now(),
      trades,
      pnl,
      winRate,
      profitFactor,
      sharpeRatio: sharpe,
      maxDrawdown: maxDd,
      tradeCount: trades.length,
      winCount: wins.length,
      lossCount: losses.length,
 balance: this.executor.getPnlSummary().balance,
 equity: this.executor.getPnlSummary().equity,
    };
  }

  private _calcSharpe(trades: PaperTrade[]): number {
    const daily = new Map<string, number>();
    for (const t of trades) {
      const day = new Date(t.timestamp).toISOString().split('T')[0] ?? '';
      daily.set(day, (daily.get(day) ?? 0) + (t.pnl ?? 0));
    }
    const vals = Array.from(daily.values());
    if (vals.length < 2) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.map((v) => (v - avg) ** 2).reduce((a, b) => a + b, 0) / vals.length);
    if (std === 0) return 0;
    return (avg / std) * Math.sqrt(252);
  }

  private _calcMaxDrawdown(trades: PaperTrade[]): number {
    let peak = 0;
    let equity = 0;
    let maxDd = 0;
    for (const t of trades) {
      equity += t.pnl ?? 0;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? (peak - equity) / peak : 0;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let trackerInstance: PaperPnlTracker | null = null;

export function getPaperPnlTracker(executor?: PaperExecutor): PaperPnlTracker {
  if (!trackerInstance) {
    trackerInstance = new PaperPnlTracker(executor);
  }
  return trackerInstance;
}
