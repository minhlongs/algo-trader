/**
 * Liquidity Vacuum Strategy — V2 migration stub.
 *
 * Identifies markets where liquidity has suddenly evaporated
 * and trades the subsequent volatility reversion.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createLiquidityVacuumTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[liquidity-vacuum] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
