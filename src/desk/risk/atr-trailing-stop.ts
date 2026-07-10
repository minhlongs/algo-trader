/**
 * ATR Trailing Stop-Loss
 *
 * Computes dynamic stop-loss levels based on Average True Range (ATR).
 * Trailing stops tighten as price moves favorably — never loosen.
 *
 * Long:  stop = highestHigh - multiplier × ATR
 * Short: stop = lowestLow   + multiplier × ATR
 */
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AtrConfig = { period: 14, multiplier: 2.0 };

// ── Calculator ─────────────────────────────────────────────────────────────

export class AtrTrailingStop {
  /**
   * Compute True Range for a single candle given previous close.
   * TR = max(high - low, |high - prevClose|, |low - prevClose|)
   */
  static trueRange(candle: AtrCandle, prevClose: number): number {
    const hl = candle.high - candle.low;
    const hpc = Math.abs(candle.high - prevClose);
    const lpc = Math.abs(candle.low - prevClose);
    return Math.max(hl, hpc, lpc);
  }

  /**
   * Compute ATR via Wilder's smoothed moving average.
   * First value is simple average of initial TRs; subsequent values use
   * Wilder's formula: ATR = (prevATR × (period-1) + TR) / period
   */
  static computeAtr(candles: AtrCandle[], config: AtrConfig = DEFAULT_CONFIG): number[] {
    const { period } = config;
    if (candles.length < period + 1) {
      logger.warn('ATR: insufficient candles', { needed: period + 1, got: candles.length });
      return [];
    }

    const trValues: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      trValues.push(AtrTrailingStop.trueRange(candles[i], candles[i - 1].close));
    }

    const atr: number[] = [];
    // Initial ATR = simple average of first `period` TR values
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trValues[i];
    }
    atr.push(sum / period);

    // Wilder's smoothing
    for (let i = period; i < trValues.length; i++) {
      const prevAtr = atr[atr.length - 1];
      atr.push((prevAtr * (period - 1) + trValues[i]) / period);
    }

    return atr;
  }

  /**
   * Compute trailing stop levels for a long position.
   * Stop = highestHighSinceEntry - multiplier × ATR
   *
   * Returns an array of stop levels aligned with candle indices.
   * Stop only moves UP (never down for longs).
   */
  static trailingStopLong(
    candles: AtrCandle[],
    atrValues: number[],
    multiplier: number = DEFAULT_CONFIG.multiplier,
  ): number[] {
    if (atrValues.length === 0) return [];

    const stops: number[] = [];
    let highestHigh = candles[0].high;
    let currentStop = -Infinity;

    // atrValues[i] corresponds to candle[i+period] (ATR lags by `period` bars)
    const offset = candles.length - atrValues.length;

    for (let i = 0; i < candles.length; i++) {
      if (i > 0 && candles[i].high > highestHigh) {
        highestHigh = candles[i].high;
      }
      const atrIdx = i - offset;
      if (atrIdx >= 0) {
        const candidate = highestHigh - multiplier * atrValues[atrIdx];
        currentStop = Math.max(currentStop, candidate);
      }
      stops.push(currentStop);
    }

    return stops;
  }

  /**
   * Compute trailing stop levels for a short position.
   * Stop = lowestLowSinceEntry + multiplier × ATR
   *
   * Stop only moves DOWN (never up for shorts).
   */
  static trailingStopShort(
    candles: AtrCandle[],
    atrValues: number[],
    multiplier: number = DEFAULT_CONFIG.multiplier,
  ): number[] {
    if (atrValues.length === 0) return [];

    const stops: number[] = [];
    let lowestLow = candles[0].low;
    let currentStop = Infinity;

    const offset = candles.length - atrValues.length;

    for (let i = 0; i < candles.length; i++) {
      if (i > 0 && candles[i].low < lowestLow) {
        lowestLow = candles[i].low;
      }
      const atrIdx = i - offset;
      if (atrIdx >= 0) {
        const candidate = lowestLow + multiplier * atrValues[atrIdx];
        currentStop = Math.min(currentStop, candidate);
      }
      stops.push(currentStop);
    }

    return stops;
  }

  /**
   * Evaluate whether the stop has been hit (close crosses the stop level).
   */
  static evaluate(
    candles: AtrCandle[],
    stops: number[],
    direction: 'long' | 'short',
  lastAtr?: number,
  ): AtrResult {
    if (stops.length === 0 || candles.length === 0) {
      return { atr: 0, stop: 0, stopped: false, direction };
    }

    const lastIdx = candles.length - 1;
    const lastClose = candles[lastIdx].close;
    const lastStop = stops[lastStopIdx(stops)];

    const stopped =
      direction === 'long'
        ? lastClose <= lastStop
        : lastClose >= lastStop;

    // Approximate current ATR from stop distance
    // (full ATR array passed to trailingStop* — we use the last computed value)
    const atr = lastAtr ?? 0; // passed explicitly by caller when known

    return { atr, stop: lastStop, stopped, direction };
  }
}

/** Find the last valid (non-Infinity/-Infinity) stop in the array */
function lastStopIdx(stops: number[]): number {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (Number.isFinite(stops[i])) return i;
  }
  return stops.length - 1;
}
