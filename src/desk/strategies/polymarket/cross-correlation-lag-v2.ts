/**
 * Cross-Correlation Lag V2 — extends BasePolymarketStrategy (Barrel Facade).
 *
 * Detects lead-lag relationships between markets via cross-correlation
 * analysis. When market A's price changes predict market B's future
 * changes, trades the lagging market based on the leader's recent move.
 *
 * Uses gamma.getEvents() instead of getTrending() — overrides execute().
 */

export type {
  CrossCorrelationLagConfig,
  CrossCorrelationLagDeps,
} from './cross-correlation-lag-types';

export {
  DEFAULT_CONFIG,
} from './cross-correlation-lag-types';

export {
  calcPearsonCorrelation,
  calcCrossCorrelation,
  findBestLag,
  predictMove,
} from './cross-correlation-lag-math';

export {
  CrossCorrelationLagStrategy,
  createCrossCorrelationLagTick,
} from './cross-correlation-lag-strategy';
