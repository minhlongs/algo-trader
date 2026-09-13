/**
 * Session Volatility Sniper Strategy (Facade)
 *
 * Detects intraday volatility spikes by comparing current ATR to its
 * rolling average. A spike above 2x the rolling average signals a
 * directional continuation opportunity. Trades in the direction of the spike.
 *
 * Entry: ATR spike (current ATR > rollingAvgATR x multiplier) -> trade in spike direction
 * Exit: volatility mean-reversion (short ATR drops to avg) or session time-stop
 */

export type {
  SessionVolSniperConfig,
} from './session-vol-sniper-types';

export {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './session-vol-sniper-types';

export {
  calcATR,
  calcAverage,
  detectSpike,
  detectMeanReversion,
} from './session-vol-sniper-math';

export {
  SessionVolSniperStrategy,
  createSessionVolSniperTick,
} from './session-vol-sniper-strategy';
