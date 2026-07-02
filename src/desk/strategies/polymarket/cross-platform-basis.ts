/**
 * Cross-Platform Basis Strategy — V2 migration stub.
 *
 * Captures basis differences between the same or similar
 * markets trading on different platforms (e.g., Polymarket vs Kalshi).
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createCrossPlatformBasisTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[cross-platform-basis] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 implementation
  };
}
