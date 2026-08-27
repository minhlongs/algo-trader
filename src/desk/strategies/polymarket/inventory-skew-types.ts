/**
 * Inventory Skew Rebalancer — shared types.
 * Split from inventory-skew-rebalancer.ts (S16 tranche 3). Pure type module, no runtime logic.
 */

import type { ClobClient } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient } from '../../polymarket/gamma-client';

export interface InventorySkewRebalancerConfig {
  /** Absolute skew threshold to trigger rebalance — range (0, 1] */
  skewThreshold: number;
  /** Max fraction of total portfolio any single position may occupy */
  maxConcentrationPct: number;
  /** Fraction of an overweight position to sell when trimming */
  trimPct: number;
  /** Minimum unrealised P&L (USDC) before a position may be trimmed */
  minPnlToTrim: number;
  /** Minimum interval between rebalance passes (ms) */
  rebalanceIntervalMs: number;
  /** Max number of trades placed per rebalance pass */
  maxTradesPerRebalance: number;
  /** Default position size (USDC string) for the buy side of rebalance */
  positionSize: string;
}

export const DEFAULT_CONFIG: InventorySkewRebalancerConfig = {
  skewThreshold: 0.3,
  maxConcentrationPct: 0.4,
  trimPct: 0.25,
  minPnlToTrim: 0.01,
  rebalanceIntervalMs: 60_000,
  maxTradesPerRebalance: 3,
  positionSize: '10',
};

export const STRATEGY_NAME = 'inventory-skew-rebalancer';

export interface TrackedPosition {
  tokenId: string;
  side: 'yes' | 'no';
  size: number;
  entryPrice: number;
  currentPrice: number;
  marketId: string;
}

export interface InventorySkewRebalancerDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<InventorySkewRebalancerConfig>;
}