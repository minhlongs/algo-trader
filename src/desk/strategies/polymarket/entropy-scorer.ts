/**
 * Entropy Scorer Strategy — V2 migration stub.
 *
 * Scores market uncertainty using information entropy
 * and trades when entropy indicates mispricing.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createEntropyScorerTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[entropy-scorer] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
