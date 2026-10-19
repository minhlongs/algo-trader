import { logger } from '../../shared/utils/logger';
import { AtrCandle, AtrConfig, DEFAULT_ATR_CONFIG } from './atr-trailing-stop-types';

export class AtrTrailingStopMath {
  /**
   * Compute True Range for a single candle given previous close.
   * TR = max(high - low, |high - prevClose|, |low - prevClose|)
   */
  public static trueRange(candle: AtrCandle, prevClose: number): number {
    const hl = candle.high - candle.low;
    const hpc = Math.abs(candle.high - prevClose);
    const lpc = Math.abs(candle.low - prevClose);
    return Math.max(hl, hpc, lpc);
  }

  /**
   * Compute ATR via Wilder's smoothed moving average.
   */
  public static computeAtr(
    candles: AtrCandle[],
    config: AtrConfig = DEFAULT_ATR_CONFIG
  ): number[] {
    const { period } = config;
    if (candles.length < period + 1) {
      logger.warn('ATR: insufficient candles', { needed: period + 1, got: candles.length });
      return [];
    }

    const trValues: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      trValues.push(this.trueRange(candles[i], candles[i - 1].close));
    }

    const atr: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trValues[i];
    }
    atr.push(sum / period);

    for (let i = period; i < trValues.length; i++) {
      const prevAtr = atr[atr.length - 1];
      atr.push((prevAtr * (period - 1) + trValues[i]) / period);
    }

    return atr;
  }

  public static lastStopIdx(stops: number[]): number {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (Number.isFinite(stops[i])) return i;
    }
    return stops.length - 1;
  }
}
