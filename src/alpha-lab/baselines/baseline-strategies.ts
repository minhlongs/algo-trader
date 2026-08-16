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
  BaselineConfig,
  BaselineCostConfig,
  BaselineResult,
  BuyHoldConfig,
  RandomEntryConfig,
  MomentumConfig,
  MeanReversionConfig,
} from './baseline-types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32) for reproducibility. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundTripCost(price: number, cost: BaselineCostConfig): number {
  const multiplier = (cost.feeBps + cost.slippageBps) / 10000;
  return price * multiplier * 2;
}

function makeTrade(
  timestamp: string,
  entryPrice: number,
  exitPrice: number,
  cost: BaselineCostConfig,
  size = 1,
): BacktestTrade {
  const gross = (exitPrice - entryPrice) * size;
  const fee = roundTripCost(entryPrice, cost);
  return {
    timestamp,
    tokenId: '',
    side: 'BUY',
    price: exitPrice,
    size,
    pnl: gross - fee,
  };
}

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

// ── Simple Momentum ───────────────────────────────────────────────────────────

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

// ── Simple Mean Reversion ─────────────────────────────────────────────────────

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
