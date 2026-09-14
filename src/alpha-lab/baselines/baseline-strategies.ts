/**
 * Baseline Strategies
 *
 * Simple benchmark strategies for comparison against candidate alpha strategies.
 * Each produces BacktestTrade[] compatible with existing computeMetrics.
 *
 * All baselines apply fees + slippage (round-trip cost model).
 * No future data is used — each signal only depends on data at or before entry.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';
import type {
  BaselineResult,
  BuyHoldConfig,
  RandomEntryConfig,
} from './baseline-types';
import { mulberry32, makeTrade } from './baseline-trade-helpers';

// Re-export trade helpers and technical strategies for 100% backward compatibility
export { mulberry32, roundTripCost, makeTrade } from './baseline-trade-helpers';
export { simpleMomentum, simpleMeanReversion } from './baseline-technical-strategies';

// ── Buy & Hold ────────────────────────────────────────────────────────────────

/**
 * Buy at entryIdx, hold until end of data.
 * Single trade representing full-period buy-and-hold return.
 */
export function buyAndHold(
  closes: Array<{ timestamp: string; close: number }>,
  config: BuyHoldConfig = { cost: { feeBps: 5, slippageBps: 2 }, seed: 42 },
): BaselineResult {
  if (closes.length < 2) {
    return { name: 'buy-and-hold', trades: [], totalTrades: 0 };
  }
  const entryIdx = config.entryIdx ?? 0;
  if (entryIdx >= closes.length - 1) {
    return { name: 'buy-and-hold', trades: [], totalTrades: 0 };
  }
  const entry = closes[entryIdx]!;
  const exit = closes[closes.length - 1]!;
  const trade = makeTrade(entry.timestamp, entry.close, exit.close, config.cost);
  return { name: 'buy-and-hold', trades: [trade], totalTrades: 1 };
}

// ── Random Entry ──────────────────────────────────────────────────────────────

/**
 * Enter at random bars, hold for random duration up to maxHolding.
 * Deterministic via seed.
 */
export function randomEntry(
  closes: Array<{ timestamp: string; close: number }>,
  config: RandomEntryConfig = { cost: { feeBps: 5, slippageBps: 2 }, seed: 42 },
): BaselineResult {
  const rate = config.tradeRate ?? 0.1;
  const maxHolding = config.maxHolding ?? 10;
  const rng = mulberry32(config.seed);

  const trades: BacktestTrade[] = [];
  let i = 0;
  while (i < closes.length - maxHolding) {
    if (rng() < rate) {
      const entry = closes[i]!;
      const hold = Math.floor(rng() * maxHolding) + 1;
      const exitIdx = Math.min(i + hold, closes.length - 1);
      const exit = closes[exitIdx]!;
      trades.push(makeTrade(entry.timestamp, entry.close, exit.close, config.cost));
      i = exitIdx + 1;
    } else {
      i++;
    }
  }
  return { name: 'random-entry', trades, totalTrades: trades.length };
}
