/**
 * GRU Neural Network Trading Strategy (Facade)
 *
 * Uses GRU model predictions for buy/sell signals.
 */

export type {
  ISignal,
  ICandle,
  IStrategy,
  GruStrategyConfig,
} from './gru-strategy-types';

export {
  DEFAULT_GRU_STRATEGY_CONFIG,
} from './gru-strategy-types';

export {
  GruStrategy,
} from './gru-strategy-core';
