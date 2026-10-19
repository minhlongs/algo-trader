/**
 * Pure vacuum detection, book depth, and config helpers for LiquidityVacuumStrategy.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface LiquidityVacuumConfig extends BaseStrategyConfig {
  /** Depth ratio threshold to detect vacuum (e.g., 0.3 = 30% of avg) */
  vacuumThreshold: number;
  /** Depth ratio threshold to recover and exit (e.g., 0.7 = 70% of avg) */
  recoveryThreshold: number;
  /** Number of ticks for trailing depth average */
  depthLookback: number;
  /** Minimum vacuum depth (USDC) to consider valid */
  minVacuumDepth: number;
}

export const DEFAULT_CONFIG: LiquidityVacuumConfig = {
  vacuumThreshold: 0.3,
  recoveryThreshold: 0.7,
  depthLookback: 10,
  minVacuumDepth: 100,
  minVolume: 2000,
  takeProfitPct: 0.035,
  stopLossPct: 0.02,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute total order book depth (bid + ask volume in USDC). */
export function computeTotalDepth(book: RawOrderBook): number {
  const bidDepth = book.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = book.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  return bidDepth + askDepth;
}

/** Ratio of current depth to trailing average. Returns 1 if no history. */
export function computeDepthRatio(currentDepth: number, history: number[]): number {
  if (history.length === 0) return 1;
  const avgDepth = history.reduce((s, v) => s + v, 0) / history.length;
  return avgDepth > 0 ? currentDepth / avgDepth : 1;
}

/** Entry direction: bet against the side that lost liquidity. */
export function getVacuumDirection(book: RawOrderBook): 'yes' | 'no' | null {
  const bidDepth = book.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = book.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  const total = bidDepth + askDepth;
  if (total <= 0) return null;
  const askRatio = askDepth / total;
  // If asks dominate, bid side is under-priced -> buy yes
  // If bids dominate, ask side is over-priced -> buy no
  if (askRatio > 0.7) return 'yes';
  if (askRatio < 0.3) return 'no';
  return null;
}
