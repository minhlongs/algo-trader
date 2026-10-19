/**
 * ATR Trailing Stop-Loss Types & Defaults
 *
 * @module desk/risk/atr-trailing-stop-types
 */

export interface AtrCandle {
  high: number;
  low: number;
  close: number;
}

export interface AtrConfig {
  /** ATR lookback period (default 14) */
  period: number;
  /** Stop distance multiplier (default 2.0 → 2× ATR) */
  multiplier: number;
}

export interface AtrResult {
  /** Current ATR value */
  atr: number;
  /** Trailing stop level */
  stop: number;
  /** Whether the stop has been hit (close crosses stop) */
  stopped: boolean;
  /** Direction the stop is tracking */
  direction: 'long' | 'short';
}

export const DEFAULT_ATR_CONFIG: AtrConfig = { period: 14, multiplier: 2.0 };
