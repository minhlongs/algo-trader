/**
 * Book Imbalance Reversal Strategy — V2 migration stub.
 *
 * Detects orderbook bid/ask imbalance and trades mean-reversion
 * when the book is heavily skewed.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createBookImbalanceReversalTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[book-imbalance-reversal] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
