/**
 * Liquidation Cascade Strategy — V2 migration stub.
 *
 * Captures price cascades caused by liquidations, entering
 * on overshoot and exiting on mean-reversion.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createLiquidationCascadeTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[liquidation-cascade] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
