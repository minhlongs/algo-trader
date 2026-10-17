/**
 * ATR Trailing Stop-Loss
 *
 * Computes dynamic stop-loss levels based on Average True Range (ATR).
 * Trailing stops tighten as price moves favorably — never loosen.
 *
 * Long:  stop = highestHigh - multiplier × ATR
 * Short: stop = lowestLow   + multiplier × ATR
 */
import {
  AtrCandle,
  AtrConfig,
  AtrResult,
  DEFAULT_ATR_CONFIG,
} from './atr-trailing-stop-types';
import { AtrTrailingStopMath } from './atr-trailing-stop-math';

export * from './atr-trailing-stop-types';
export * from './atr-trailing-stop-math';

export class AtrTrailingStop {
  static trueRange(candle: AtrCandle, prevClose: number): number {
    return AtrTrailingStopMath.trueRange(candle, prevClose);
  }

  static computeAtr(candles: AtrCandle[], config: AtrConfig = DEFAULT_ATR_CONFIG): number[] {
    return AtrTrailingStopMath.computeAtr(candles, config);
  }

  static trailingStopLong(
    candles: AtrCandle[],
    atrValues: number[],
    multiplier: number = DEFAULT_ATR_CONFIG.multiplier
  ): number[] {
    if (atrValues.length === 0) return [];

    const stops: number[] = [];
    let highestHigh = candles[0].high;
    let currentStop = -Infinity;
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

  static trailingStopShort(
    candles: AtrCandle[],
    atrValues: number[],
    multiplier: number = DEFAULT_ATR_CONFIG.multiplier
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

  static evaluate(
    candles: AtrCandle[],
    stops: number[],
    direction: 'long' | 'short',
    lastAtr?: number
  ): AtrResult {
    if (stops.length === 0 || candles.length === 0) {
      return { atr: 0, stop: 0, stopped: false, direction };
    }

    const lastIdx = candles.length - 1;
    const lastClose = candles[lastIdx].close;
    const lastStop = stops[AtrTrailingStopMath.lastStopIdx(stops)];

    const stopped =
      direction === 'long'
        ? lastClose <= lastStop
        : lastClose >= lastStop;

    const atr = lastAtr ?? 0;
    return { atr, stop: lastStop, stopped, direction };
  }
}
