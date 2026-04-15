/**
 * Shared types for Polymarket strategies.
 * Common interfaces used across 30+ strategy files.
 */

import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client.js';
import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client.js';
import type { StrategyName } from '../../core/types.js';

/** Common dependency injection for all strategies */
export interface StrategyDeps {
  clob: ClobClient;
  orders: OrderManager;
  bus: EventBus;
  gamma: GammaClient;
}

/** Base open position fields shared across all strategies */
export interface BaseOpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

/** Price tick with timestamp */
export interface PriceTick {
  price: number;
  timestamp: number;
}

/** Strategy execution result */
export interface StrategySignal {
  action: 'buy_yes' | 'buy_no' | 'hold' | 'exit';
  tokenId: string;
  conditionId: string;
  confidence: number;
  reason: string;
}

/** Common strategy interface */
export interface PolymarketStrategy {
  name: StrategyName;
  execute(): Promise<void>;
  getPositionCount(): number;
}

// Re-export dependency types for convenience
export type { ClobClient, RawOrderBook, OrderManager, EventBus, GammaClient, GammaMarket, StrategyName };
