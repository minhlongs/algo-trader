/**
 * Shared Equity Curve Builder
 *
 * Compiles trade PnL into a strategy equity curve for Sharpe / maxDrawdown
 * computation. Used by experiment-engine, baseline-runner, and evaluation-engine
 * so every alpha-lab path computes metrics identically.
 *
 * Trades carry PnL as a return-on-capital fraction; this function compounds
 * them into an equity curve starting at 1.0. Sharpe/maxDrawdown then reflect
 * strategy returns independent of the asset's price level, so results are
 * comparable across symbols and timeframes.
 *
 * Causal invariant: trades are only ever attributed to bars at or before their
 * own timestamp — no future data enters the curve.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';

/**
 * Build a cumulative equity curve over a candle window from trade returns.
 *
 * @param closes - Candle timestamps (and only those timestamps are kept in the
 *   output curve; trades landing outside the window are ignored).
 * @param trades - Closed trades with PnL as a return-on-capital fraction.
 * @returns Equity curve starting at 1.0, compounded per bar.
 */
export function buildEquityCurve(
  closes: Array<{ timestamp: string }>,
  trades: BacktestTrade[],
): Array<{ timestamp: string; equity: number }> {
  if (closes.length === 0) return [];
  const equity: Array<{ timestamp: string; equity: number }> = closes.map((c) => ({
    timestamp: c.timestamp,
    equity: 1,
  }));
  if (trades.length === 0) return equity;

  // Aggregate PnL by trade timestamp so multiple trades on the same bar net out.
  const pnlByTimestamp = new Map<number, number>();
  for (const t of trades) {
    if (t.pnl === null) continue; // skip unconverted trades
    const ts = new Date(t.timestamp).getTime();
    pnlByTimestamp.set(ts, (pnlByTimestamp.get(ts) ?? 0) + t.pnl);
  }

  let runningEquity = 1;
  for (const bar of equity) {
    const ts = new Date(bar.timestamp).getTime();
    runningEquity *= 1 + (pnlByTimestamp.get(ts) ?? 0);
    bar.equity = runningEquity;
  }
  return equity;
}