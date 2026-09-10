/**
 * Paper PnL Tracker — Pure Computation Functions
 *
 * Submodule extracted from paper-pnl-tracker.ts to keep files under 200 lines.
 * Contains types and pure computation logic with no I/O side effects.
 */

import { PaperTrade } from '../../execution/paper-executor';

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

export interface DailyPnl extends PnlPeriod {}
export interface WeeklyPnl extends PnlPeriod {}
export interface MonthlyPnl extends PnlPeriod {}

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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function calcSharpe(trades: PaperTrade[]): number {
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

export function calcMaxDrawdown(trades: PaperTrade[]): number {
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

export function buildPeriod(
  label: string,
  trades: PaperTrade[],
  balanceSnapshot: number,
  equitySnapshot: number,
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

  return {
    label,
    startMs: startMs ?? trades[0]?.timestamp ?? Date.now(),
    endMs: endMs ?? trades[trades.length - 1]?.timestamp ?? Date.now(),
    trades,
    pnl,
    winRate,
    profitFactor,
    sharpeRatio: calcSharpe(trades),
    maxDrawdown: calcMaxDrawdown(trades),
    tradeCount: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    balance: balanceSnapshot,
    equity: equitySnapshot,
  };
}

export function computePeriods(
  trades: PaperTrade[],
  granularity: 'day' | 'week' | 'month',
  count: number,
  balanceSnapshot: number,
  equitySnapshot: number,
): PnlPeriod[] {
  const buckets = new Map<string, PaperTrade[]>();
  for (const t of trades) {
    const d = new Date(t.timestamp);
    let key: string;
    if (granularity === 'day') {
      key = d.toISOString().split('T')[0] ?? '';
    } else if (granularity === 'week') {
      const ws = new Date(d);
      ws.setUTCDate(d.getUTCDate() - d.getUTCDay());
      key = ws.toISOString().split('T')[0] ?? '';
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
  return sorted.map(([label, ts]) => buildPeriod(label, ts, balanceSnapshot, equitySnapshot));
}
