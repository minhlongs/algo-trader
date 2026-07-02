/**
 * Price Impact Estimator Config & Helpers
 *
 * Exported types, config, pure helpers, and dependencies interface.
 * Extracted from price-impact-estimator.ts to keep files under 200 lines.
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface PriceImpactEstimatorConfig {
  /** Simulated order size in shares */
  hypotheticalSize: number;
  /** Minimum ratio of impacts to trigger a signal */
  asymmetryThreshold: number;
  /** EMA alpha for tracking impact over time */
  impactEmaAlpha: number;
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.025 = 2.5%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.02 = 2%) */
  stopLossPct: number;
  /** Max hold time in ms before forced exit */
  maxHoldMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Per-market cooldown after exit (ms) */
  cooldownMs: number;
  /** Base trade size in USDC */
  positionSize: string;
}

export const DEFAULT_CONFIG: PriceImpactEstimatorConfig = {
  hypotheticalSize: 500,
  asymmetryThreshold: 2.0,
  impactEmaAlpha: 0.1,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

export const STRATEGY_NAME = 'price-impact-estimator' as StrategyName;

// ── Internal types ─────────────────────────────────────────────────────────────

export interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Walk through orderbook levels filling orderSize, return volume-weighted
 * average fill price. Returns 0 if insufficient liquidity.
 */
export function simulatePriceImpact(
  levels: { price: string; size: string }[],
  orderSize: number,
): number {
  if (orderSize <= 0) return 0;
  if (levels.length === 0) return 0;

  let remaining = orderSize;
  let totalCost = 0;
  let totalFilled = 0;

  for (const level of levels) {
    const price = parseFloat(level.price);
    const size = parseFloat(level.size);
    if (size <= 0 || price <= 0) continue;

    const fillAmount = Math.min(remaining, size);
    totalCost += fillAmount * price;
    totalFilled += fillAmount;
    remaining -= fillAmount;

    if (remaining <= 0) break;
  }

  if (remaining > 0) return 0; // insufficient liquidity
  if (totalFilled === 0) return 0;

  return totalCost / totalFilled;
}

/**
 * Calculate impact asymmetry: |buyImpact - sellImpact| / mid.
 * Returns 0 if mid is 0.
 */
export function calcImpactAsymmetry(
  buyImpact: number,
  sellImpact: number,
  mid: number,
): number {
  if (mid === 0) return 0;
  return Math.abs(buyImpact - sellImpact) / mid;
}

/**
 * Determine which side to trade based on impact comparison.
 * buyImpact < sellImpact → 'yes' (strong bid support)
 * sellImpact < buyImpact → 'no' (strong ask resistance)
 * equal → null
 */
export function determineSide(
  buyImpact: number,
  sellImpact: number,
): 'yes' | 'no' | null {
  if (buyImpact < sellImpact) return 'yes';
  if (sellImpact < buyImpact) return 'no';
  return null;
}

/**
 * Update an exponential moving average with a simple alpha-based formula.
 * newEma = alpha * value + (1 - alpha) * prev
 * Returns value when there is no previous EMA (initial case).
 */
export function updateImpactEma(
  prev: number | null,
  value: number,
  alpha: number,
): number {
  if (prev === null) return value;
  if (alpha <= 0) return prev;
  if (alpha >= 1) return value;
  return alpha * value + (1 - alpha) * prev;
}

/** Extract best bid/ask/mid from raw order book. */
export function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface PriceImpactEstimatorDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<PriceImpactEstimatorConfig>;
}
