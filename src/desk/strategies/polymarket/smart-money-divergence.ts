/**
 * Smart Money Divergence Strategy — V2 migration stub.
 *
 * Detects divergence between retail order flow and
 * institutional ("smart money") positioning.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createSmartMoneyDivergenceTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[smart-money-divergence] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
