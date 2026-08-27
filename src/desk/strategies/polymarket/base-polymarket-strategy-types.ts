/**
 * Shared types for BasePolymarketStrategy (Reactive Edition).
 * Extracted from base-polymarket-strategy.ts — re-exported there so
 * all existing importers keep compiling unmodified.
 */

import type { ClobClient } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';

export interface BaseStrategyConfig {
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.02 = 2%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.015 = 1.5%) */
  stopLossPct: number;
  /** Max hold time in ms before forced exit. Wall-clock elapsed since entry, NOT tick count. */
  maxHoldMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Per-market cooldown after exit (ms) */
  cooldownMs: number;
  /** Base trade size in USDC */
  positionSize: string;
}

export interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

export interface StrategyDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
}

export interface TradeEvent {
  orderId: string;
  marketId: string;
  side: 'buy' | 'sell';
  fillPrice: string;
  fillSize: string;
  fees: string;
  timestamp: number;
  strategy: StrategyName;
}

/** Context passed to execute() when triggered by a specific price update */
export interface ExecutionContext {
  /** Token ID that triggered this execution (if reactive) */
  triggeringTokenId?: string;
  /** Whether this is a reactive execution (vs scheduled) */
  isReactive?: boolean;
}

/** Result of evaluating exit conditions for an open position */
export interface ExitEvaluation {
  shouldExit: boolean;
  reason: string;
}

/** Custom exit condition verdict returned by strategy overrides */
export interface CustomExitVerdict {
  exit: boolean;
  reason: string;
}
