/**
 * Pairs Statistical Arbitrage Strategy — V2 migration stub.
 *
 * Trades correlated pairs of markets, entering when spread
 * deviates beyond a statistical threshold.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createPairsStatArbTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[pairs-stat-arb] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
