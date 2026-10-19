/**
 * Pure helpers and configuration for Polymarket Arbitrage Strategy.
 */

import type { StrategyName } from '../core/types';
import type { BaseStrategyConfig } from './polymarket/base-polymarket-strategy';

export interface PolymarketArbConfig extends BaseStrategyConfig {
  /** Minimum arbitrage spread to execute (e.g., 0.02 = 2%) */
  minSpread: number;
  /** Lookback ticks to compute average spread */
  spreadLookback: number;
  /** Max capital per arbitrage leg in USDC */
  maxLegSize: number;
  /** Only trade when combined YES + NO < this threshold */
  maxCombinedPrice: number;
}

export const DEFAULT_CONFIG: PolymarketArbConfig = {
  minSpread: 0.02,
  spreadLookback: 5,
  maxLegSize: 50,
  maxCombinedPrice: 0.98,
  minVolume: 2000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 60_000,
  positionSize: '25',
};

export const STRATEGY_NAME = 'polymarket-arb' as StrategyName;

/**
 * Detect a YES/NO arbitrage: combined price < 1 means synthetic 1 can be
 * constructed for less than face value.
 * Returns the spread as a positive fraction if profitable, 0 otherwise.
 */
export function detectYesNoArb(yesPrice: number, noPrice: number): number {
  const combined = yesPrice + noPrice;
  if (combined >= 1) return 0;
  return 1 - combined;
}

/**
 * Detect cross-market price discrepancy between two related markets.
 * For markets that should track the same event, returns absolute |priceA - priceB|.
 */
export function detectCrossMarketArb(priceA: number, priceB: number): number {
  return Math.abs(priceA - priceB);
}

/**
 * Track spread history and compute average.
 */
export function updateSpreadHistory(history: Map<string, number[]>, key: string, spread: number, lookback: number): number {
  let arr = history.get(key);
  if (!arr) {
    arr = [];
    history.set(key, arr);
  }
  arr.push(spread);
  if (arr.length > lookback) {
    arr.splice(0, arr.length - lookback);
  }
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
