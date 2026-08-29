/**
 * Multi-Leg Hedge Config & Helpers
 *
 * Exported types, config, pure helpers, and dependencies interface.
 * Extracted from multi-leg-hedge.ts to keep files under 200 lines.
 */
import type { ClobClient } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface MultiLegHedgeConfig {
  /** Min deviation from 1.0 to trigger entry (default 0.05 = 5%) */
  deviationThreshold: number;
  /** Exit when deviation returns within this (default 0.02) */
  convergenceThreshold: number;
  /** Min markets in event to trade (default 2) */
  minMarkets: number;
  /** Skip events with too many legs (default 10) */
  maxMarkets: number;
  /** Take-profit as fraction (default 0.02 = 2%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (default 0.03 = 3%) */
  stopLossPct: number;
  /** Max hold time in ms (default 1800000 = 30 min) */
  maxHoldMs: number;
  /** Max concurrent positions (default 4) */
  maxPositions: number;
  /** Per-event cooldown after exit (ms) (default 180000 = 3 min) */
  cooldownMs: number;
  /** Base trade size in USDC (default '25') */
  positionSize: string;
  /** Open offsetting leg (default true) */
  enableHedge: boolean;
}

export const DEFAULT_CONFIG: MultiLegHedgeConfig = {
  deviationThreshold: 0.05,
  convergenceThreshold: 0.02,
  minMarkets: 2,
  maxMarkets: 10,
  takeProfitPct: 0.02,
  stopLossPct: 0.03,
  maxHoldMs: 1_800_000,
  maxPositions: 4,
  cooldownMs: 180_000,
  positionSize: '25',
  enableHedge: true,
};

export const STRATEGY_NAME: StrategyName = 'multi-leg-hedge';

// ── Internal types ─────────────────────────────────────────────────────────────

export interface HedgePosition {
  eventId: string;
  primaryLeg: {
    tokenId: string;
    conditionId: string;
    side: 'yes' | 'no';
    entryPrice: number;
    orderId: string;
  };
  hedgeLeg: {
    tokenId: string;
    conditionId: string;
    side: 'yes' | 'no';
    entryPrice: number;
    orderId: string;
  } | null;
  sizeUsdc: number;
  entryDeviation: number;
  openedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** Calculate deviation of sum of YES prices from 1.0. */
export function calcEventDeviation(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sum = prices.reduce((s, p) => s + p, 0);
  return sum - 1.0;
}

/** Find the most mispriced market in an event group. Rank 0 = most mispriced. */
export function findMostMispriced(
  markets: { id: string; yesPrice: number }[],
): { id: string; yesPrice: number; rank: number } {
  if (markets.length === 0) {
    return { id: '', yesPrice: 0, rank: -1 };
  }
  const fairValue = 1 / markets.length;
  const sorted = [...markets].sort(
    (a, b) => Math.abs(b.yesPrice - fairValue) - Math.abs(a.yesPrice - fairValue),
  );
  return { id: sorted[0].id, yesPrice: sorted[0].yesPrice, rank: 0 };
}

/** Calculate hedge size proportional to deviation magnitude. */
export function calcHedgeSize(baseSize: number, deviation: number, threshold: number): number {
  if (threshold <= 0) return baseSize;
  const scale = Math.abs(deviation) / threshold;
  return Math.min(baseSize * scale, baseSize);
}

/** Determine whether to enter based on deviation. */
export function shouldEnterHedge(
  deviation: number,
  config: MultiLegHedgeConfig,
): 'overpriced' | 'underpriced' | null {
  if (Math.abs(deviation) <= config.deviationThreshold) return null;
  return deviation > 0 ? 'overpriced' : 'underpriced';
}

/** Best mid price from an order book; assumes 0 bid / 1 ask when a side is empty. */
export function bestMid(book: { bids: { price: string }[]; asks: { price: string }[] }): number {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return (bid + ask) / 2;
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface MultiLegHedgeDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<MultiLegHedgeConfig>;
}
