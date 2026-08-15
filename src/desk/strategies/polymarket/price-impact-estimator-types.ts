/**
 * Types and configuration for Price Impact Estimator strategy.
 *
 * This strategy estimates the price impact of hypothetical orders by analyzing
 * orderbook depth. Deep liquidity at current price signals strong support/resistance.
 */
import type { ClobClient } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';

// ── Config ───────────────────────────────────────────────────────────────────

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

// ── Internal types ───────────────────────────────────────────────────────────

/** Represents an open position tracked by the strategy. */
export interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface PriceImpactEstimatorDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<PriceImpactEstimatorConfig>;
}
