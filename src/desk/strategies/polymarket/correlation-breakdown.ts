/**
 * Correlation Breakdown Strategy — V2 implementation.
 *
 * Detects when historically correlated market pairs diverge by more
 * than a configurable Z-score threshold.
 *
 * Decomposed into modular submodules. Re-exports 100% public contracts.
 */

export type { CorrelationBreakdownConfig } from './correlation-breakdown-types';
export {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './correlation-breakdown-types';

export {
  calcPearsonR,
  calcCorrZScore,
} from './correlation-breakdown-math';

export {
  CorrelationBreakdownStrategy,
  createCorrelationBreakdownTick,
} from './correlation-breakdown-strategy';
