/**
 * Kalman Filter Tracker Strategy — V2 migration stub.
 *
 * Uses Kalman filter to estimate hidden price state and
 * trade deviations between observed and estimated values.
 *
 * NOTE: Placeholder awaiting V2 implementation.
 */
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

export function createKalmanFilterTrackerTick(deps: StrategyDeps): () => Promise<void> {
  logger.warn('[kalman-filter-tracker] Strategy not implemented — no-op placeholder', 'StrategyWiring');
  return async () => {
    // No-op: strategy implementation pending V2 migration
  };
}
