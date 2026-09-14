/**
 * Baseline Technical Strategies
 *
 * Moving average and mean reversion benchmark strategies.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';
import type {
  BaselineResult,
  MomentumConfig,
  MeanReversionConfig,
} from './baseline-types';
import { makeTrade } from './baseline-trade-helpers';

/**
 * Long-only momentum: buy when short MA crosses above long MA, sell after maxHolding.
 * Causal: MA at bar i uses only bars <= i.
 */
export function simpleMomentum(
  closes: Array<{ timestamp: string; close: number }>,
  config: MomentumConfig = { cost: { feeBps: 5, slippageBps: 2 }, seed: 42 },
): BaselineResult {
  const shortP = config.shortPeriod ?? 10;
  const longP = config.longPeriod ?? 30;
  const maxHolding = config.maxHolding ?? 20;

  if (closes.length < longP + 1) {
    return { name: 'simple-momentum', trades: [], totalTrades: 0 };
  }

  const prices = closes.map((c) => c.close);
  const trades: BacktestTrade[] = [];
  let holding = false;
  let entryIdx = 0;

  for (let i = longP; i < closes.length - maxHolding; i++) {
    const shortMA = prices.slice(i - shortP + 1, i + 1).reduce((a, b) => a + b, 0) / shortP;
    const longMA = prices.slice(i - longP + 1, i + 1).reduce((a, b) => a + b, 0) / longP;

    if (!holding && shortMA > longMA) {
      holding = true;
      entryIdx = i;
    } else if (holding && i - entryIdx >= maxHolding) {
      const entry = closes[entryIdx]!;
      const exit = closes[i]!;
      trades.push(makeTrade(entry.timestamp, entry.close, exit.close, config.cost));
      holding = false;
    }
  }

  // Close any open position at end.
  if (holding && entryIdx < closes.length) {
    const entry = closes[entryIdx]!;
    const exit = closes[closes.length - 1]!;
    trades.push(makeTrade(entry.timestamp, entry.close, exit.close, config.cost));
  }

  return { name: 'simple-momentum', trades, totalTrades: trades.length };
}

/**
 * Long-only mean reversion: buy when price is far below MA, sell when near/above.
 * Causal: MA at bar i uses only bars <= i.
 */
export function simpleMeanReversion(
  closes: Array<{ timestamp: string; close: number }>,
  config: MeanReversionConfig = { cost: { feeBps: 5, slippageBps: 2 }, seed: 42 },
): BaselineResult {
  const period = config.period ?? 20;
  const entryThresh = config.entryThreshold ?? 1.5;
  const exitThresh = config.exitThreshold ?? 0.5;
  const maxHolding = config.maxHolding ?? 20;

  if (closes.length < period + 1) {
    return { name: 'simple-mean-reversion', trades: [], totalTrades: 0 };
  }

  const prices = closes.map((c) => c.close);
  const trades: BacktestTrade[] = [];
  let holding = false;
  let entryIdx = 0;

  for (let i = period; i < closes.length - maxHolding; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((s, p) => s + (p - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    if (std === 0) continue;

    const zScore = (prices[i]! - mean) / std;

    if (!holding && zScore < -entryThresh) {
      holding = true;
      entryIdx = i;
    } else if (holding && (zScore > -exitThresh || i - entryIdx >= maxHolding)) {
      const entry = closes[entryIdx]!;
      const exit = closes[i]!;
      trades.push(makeTrade(entry.timestamp, entry.close, exit.close, config.cost));
      holding = false;
    }
  }

  // Close any open position at end.
  if (holding && entryIdx < closes.length) {
    const entry = closes[entryIdx]!;
    const exit = closes[closes.length - 1]!;
    trades.push(makeTrade(entry.timestamp, entry.close, exit.close, config.cost));
  }

  return { name: 'simple-mean-reversion', trades, totalTrades: trades.length };
}
