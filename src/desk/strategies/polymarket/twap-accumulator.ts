/**
 * TWAP Accumulator Strategy — V2 migration stub.
 *
 * Accumulates positions using Time-Weighted Average Price
 * execution to minimize market impact on large orders.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createTwapAccumulatorTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[twap-accumulator] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
