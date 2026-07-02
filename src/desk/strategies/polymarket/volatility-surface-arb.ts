/**
 * Volatility Surface Arbitrage Strategy — V2 migration stub.
 *
 * Exploits mispricing across the volatility surface by
 * comparing implied volatilities at different strike/expiry combinations.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createVolatilitySurfaceArbTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[volatility-surface-arb] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
