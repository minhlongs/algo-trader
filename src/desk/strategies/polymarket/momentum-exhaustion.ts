/**
 * Momentum Exhaustion Strategy — V2 migration stub.
 *
 * Identifies when momentum is exhausting by tracking
 * deceleration in price velocity and volume decline.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createMomentumExhaustionTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[momentum-exhaustion] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
