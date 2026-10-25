/**
 * Slippage Book Walk
 *
 * Level-by-level VWAP book walking shared by the buy and sell slippage paths.
 * Both sides run the identical algorithm against opposite book sides with an
 * inverted sign on the slippage comparison, so the walk lives here once.
 */

import type {
  OrderBookLevel,
  VwapSlippageResult,
} from './profitability-types';

/** One raw order book level — either a [price, amount] tuple or an object. */
export type RawBookLevel = OrderBookLevel | [number, number];

/** One normalized, validated order book level. */
export interface BookLevel {
  price: number;
  amount: number;
}

/** Walk a normal direction book: average fill price vs. the best (top) level. */
export function walkBookProSide(
  levels: BookLevel[],
  targetAmount: number,
): { vwap: number; slippagePerUnit: number; filledAmount: number; insufficient: boolean } {
  let remaining = targetAmount;
  let totalCost = 0;
  let totalFilled = 0;

  for (const level of levels) {
    const fill = Math.min(remaining, level.amount);
    totalCost += fill * level.price;
    totalFilled += fill;
    remaining -= fill;
    if (remaining <= 0) break;
  }

  const vwap = totalFilled > 0 ? totalCost / totalFilled : 0;
  const bestLevel = levels[0]!.price;
  return {
    vwap,
    slippagePerUnit: Math.max(0, vwap - bestLevel),
    filledAmount: totalFilled,
    insufficient: remaining > 0,
  };
}

/** Walk an adverse direction book: best (top) level is the achievable floor. */
export function walkBookContraSide(
  levels: BookLevel[],
  targetAmount: number,
): { vwap: number; slippagePerUnit: number; filledAmount: number; insufficient: boolean } {
  let remaining = targetAmount;
  let totalRevenue = 0;
  let totalFilled = 0;

  for (const level of levels) {
    const fill = Math.min(remaining, level.amount);
    totalRevenue += fill * level.price;
    totalFilled += fill;
    remaining -= fill;
    if (remaining <= 0) break;
  }

  const vwap = totalFilled > 0 ? totalRevenue / totalFilled : 0;
  const bestLevel = levels[0]!.price;
  return {
    vwap,
    slippagePerUnit: Math.max(0, bestLevel - vwap),
    filledAmount: totalFilled,
    insufficient: remaining > 0,
  };
}

/**
 * Normalize a raw book side (tuple or object levels) into validated levels,
 * sorted ascending (`pro`) or descending (`contra`).
 */
export function normalizeBookLevels(
  raw: ReadonlyArray<RawBookLevel> | undefined,
  order: 'pro' | 'contra',
): BookLevel[] {
  const normalized: BookLevel[] = [];
  for (const lvl of raw ?? []) {
    const level = Array.isArray(lvl) ? { price: lvl[0], amount: lvl[1] } : lvl;
    if (level.price > 0 && level.amount > 0) {
      normalized.push({ price: level.price, amount: level.amount });
    }
  }

  return normalized.sort((a, b) => (order === 'pro' ? a.price - b.price : b.price - a.price));
}

/** Empty result used whenever the requested fill cannot even start. */
export function emptySlippageResult(): VwapSlippageResult {
  return {
    vwap: 0,
    slippageUsd: 0,
    slippageBps: 0,
    filledAmount: 0,
    insufficientLiquidity: true,
  };
}

/** Convert per-unit slippage into bps relative to the reference price. */
export function slippageBps(slippagePerUnit: number, referencePrice: number): number {
  return referencePrice > 0 ? (slippagePerUnit / referencePrice) * 10_000 : 0;
}
