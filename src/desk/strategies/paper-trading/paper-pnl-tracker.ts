/**
 * Paper Trading P&L Tracker
 *
 * Tracks daily/weekly/monthly P&L, calculates win rate, Sharpe ratio,
 * max drawdown. Exports metrics in Prometheus format for Grafana.
 *
 * Phase 23 — Paper Trading Analytics
 * Computation logic: paper-pnl-tracker-computation.ts
 * Output logic: paper-pnl-tracker-output.ts
 */

import { PaperExecutor, getPaperExecutor } from '../../execution/paper-executor';
import {
  PnlPeriod,
  PnlSummary,
  buildPeriod,
  computePeriods,
} from './paper-pnl-tracker-computation';
import { buildPrometheusExport, logPnlReport } from './paper-pnl-tracker-output';

// Re-export all types for backward compatibility
export type { PnlPeriod, DailyPnl, WeeklyPnl, MonthlyPnl, PnlSummary, PrometheusMetric } from './paper-pnl-tracker-computation';

// ─── Tracker ─────────────────────────────────────────────────────────────────

export class PaperPnlTracker {
  private executor: PaperExecutor;

  constructor(executor?: PaperExecutor) {
    this.executor = executor ?? getPaperExecutor();
  }

  /** Compute full P&L summary across all periods */
  getSummary(): PnlSummary {
    const trades = this.executor.getTradeHistory();
    const { balance, equity } = this.executor.getPnlSummary();
    const now = Date.now();
    return {
      daily: computePeriods(trades, 'day', 30, balance, equity),
      weekly: computePeriods(trades, 'week', 12, balance, equity),
      monthly: computePeriods(trades, 'month', 12, balance, equity),
      allTime: buildPeriod('all_time', trades, balance, equity),
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
    const { balance, equity } = this.executor.getPnlSummary();
    return buildPeriod('today', trades, balance, equity);
  }

  /** Get only the current week's P&L */
  getThisWeek(): PnlPeriod {
    const trades = this.executor.getTradeHistory();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
    weekStart.setUTCHours(0, 0, 0, 0);
    const filtered = trades.filter((t) => t.timestamp >= weekStart.getTime());
    const { balance, equity } = this.executor.getPnlSummary();
    return buildPeriod('this_week', filtered, balance, equity, weekStart.getTime(), now.getTime());
  }

  /** Export metrics in Prometheus text format for Grafana scraping */
  exportPrometheus(): string {
    const summary = this.getSummary();
    const unrealized = this.executor.getPositions().reduce((s, p) => s + p.unrealizedPnl, 0);
    return buildPrometheusExport(summary, unrealized, this.executor.getPositions().length);
  }

  /** Log a human-readable report */
  logReport(): void {
    logPnlReport(this.getSummary());
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
