/**
 * Regime-Aware Kelly Position Sizer (Facade)
 *
 * Wraps KellyPositionSizer with regime-based fraction multipliers.
 * Reduces exposure in unfavorable regimes (SHOCK, TREND_DOWN, HIGH_VOL)
 * and increases in favorable regimes (TREND_UP, LOW_VOL, RANGE).
 */

export {
  type RegimeAwareKellyConfig,
  type SizeSignalOptions,
  type SignalSizingOptions,
  DEFAULT_MULTIPLIERS,
} from './regime-aware-kelly-types';

export { RegimeAwareKelly } from './regime-aware-kelly-class';
export { sizeSignalToTradeSignal } from './regime-aware-kelly-signal';
