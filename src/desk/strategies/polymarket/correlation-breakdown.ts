/**
 * Correlation Breakdown Strategy — V2 migration stub.
 *
 * Detects when historically correlated market pairs diverge
 * and trades the convergence.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createCorrelationBreakdownTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[correlation-breakdown] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
