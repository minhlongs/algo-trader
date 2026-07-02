/**
 * Polymarket Arbitrage Strategy — legacy factory stub.
 *
 * Scans for cross-market price discrepancies on Polymarket and executes
 * arbitrage trades when spread exceeds configurable threshold.
 *
 * NOTE: This is a placeholder awaiting V2 migration.
 * The factory logs a warning and returns a no-op tick function.
 */
import { logger } from '../core/logger';
import type { MarketScanner } from '../polymarket/market-scanner';
import type { OrderManager } from '../polymarket/order-manager';
import type { EventBus } from '../events/event-bus';

export interface PolymarketArbDeps {
  scanner: MarketScanner;
  orderManager: OrderManager;
  eventBus: EventBus;
}

export function createPolymarketArbTick(deps: PolymarketArbDeps): () => Promise<void> {
  logger.warn('[polymarket-arb] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
