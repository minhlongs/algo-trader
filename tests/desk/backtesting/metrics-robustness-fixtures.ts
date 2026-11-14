/**
 * Shared fixtures for the metrics-calculator backward-compatibility and
 * robustness-wiring tests. Not a test file itself (no `.test.ts` suffix).
 */
import type { BacktestTrade } from '../../../src/desk/backtesting/types';

export const LEGACY_METRIC_KEYS = [
  'totalPnl',
  'sharpeRatio',
  'maxDrawdown',
  'winRate',
  'profitFactor',
  'totalTrades',
  'winningTrades',
  'losingTrades',
  'bestTrade',
  'worstTrade',
  'avgPnlPerTrade',
].sort();

export interface EquityPoint {
  timestamp: string;
  equity: number;
}

export function sampleTrades(): BacktestTrade[] {
  return [
    { timestamp: 't1', tokenId: 'a', side: 'BUY', price: 0.5, size: 100, pnl: null },
    { timestamp: 't2', tokenId: 'a', side: 'SELL', price: 0.6, size: 100, pnl: 10 },
    { timestamp: 't3', tokenId: 'b', side: 'BUY', price: 0.4, size: 100, pnl: null },
    { timestamp: 't4', tokenId: 'b', side: 'SELL', price: 0.35, size: 100, pnl: -5 },
  ];
}

export function equityFromReturns(returns: readonly number[]): EquityPoint[] {
  const curve: EquityPoint[] = [{ timestamp: 't0', equity: 1000 }];
  let value = 1000;
  returns.forEach((r, i) => {
    value *= 1 + r;
    curve.push({ timestamp: `t${i + 1}`, equity: value });
  });
  return curve;
}

export function equity(length: number): EquityPoint[] {
  const curve: EquityPoint[] = [];
  let value = 1000;
  for (let i = 0; i < length; i++) {
    // Deterministic wobble with a slight upward drift.
    value *= 1 + 0.002 + Math.sin(i / 3) * 0.004;
    curve.push({ timestamp: `t${i}`, equity: value });
  }
  return curve;
}

/** Weak-drift noise so the per-period Sharpe stays modest (~0.1) and unsaturated. */
export function modestSharpeReturns(length: number): number[] {
  return Array.from({ length }, (_, i) => 0.0001 + (((i * 7919) % 101) - 50) / 5000);
}
