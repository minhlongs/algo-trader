import type { TfId, TimeframeIndicators } from './multi-tf-types';

/**
 * Type for candle provider (injected — explicitness: no hidden dependency)
 */
export interface CandleProvider {
  /** Return candles up to `toTs` for the given TF. */
  getCandles(tf: TfId, toTs: number, count: number): Promise<TimeframeIndicators['candles']>;
  /** Optional: microstructure data for 1m / 5m. */
  getOrderBookSnapshot?(): Promise<{ bidVol: number; askVol: number }>;
}
