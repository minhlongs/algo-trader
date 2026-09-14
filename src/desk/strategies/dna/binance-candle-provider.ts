/**
 * Binance REST Candle Provider — plugs into DnaEngine CandleProvider interface.
 *
 * Uses public Binance klines API (no key required).
 * Maps Binance kline tuple → DNA Candle type.
 */

import type { Candle, TfId } from './multi-tf-types';
import {
  BINANCE_SYMBOL,
  DEFAULT_LIMIT,
  fetchBinanceCandles,
} from './binance-candle-fetcher';

export * from './binance-candle-fetcher';

const TF_INTERVAL: Record<TfId, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1d': '1d',
};

/**
 * BinanceCandleProvider — implements CandleProvider for DnaEngine.
 *
 * Caches `getLatestCandles` per-TF so multiple TFs can be polled in a single tick
 * without redundant network calls.
 *
 * INVARIANT: `this._cache` stores candles **oldest-first** (same as the output of
 * `fetchBinanceCandles`). Callers that want the newest N candles use `slice(-count)`.
 */
export class BinanceCandleProvider {
  private _cache = new Map<string, Candle[]>();
  private _cacheTs = new Map<string, number>();
  private readonly _cacheTtlMs: number;
  private readonly _symbol: string;

  constructor(symbol = BINANCE_SYMBOL, cacheTtlMs = 30_000) {
    this._cacheTtlMs = cacheTtlMs;
    this._symbol = symbol;
  }

  /**
   * Return candles up to `toTs` for the given TF.
   * Falls back to cache when fresh; fetches from Binance otherwise.
   *
   * Result is oldest-first.  Callers that want the newest `count` candles should
   * use `slice(-count)`.
   */
  async getCandles(
    tf: TfId,
    toTs: number,
    count = DEFAULT_LIMIT,
  ): Promise<Candle[]> {
    if (!(tf in TF_INTERVAL)) {
      throw new Error(`Unsupported TF: ${tf}`);
    }

    const interval = TF_INTERVAL[tf];
    const cacheKey = `${this._symbol}:${interval}`;
    const cachedAt = this._cacheTs.get(cacheKey);
    const cached = this._cache.get(cacheKey);

    const isFresh = cachedAt && Date.now() - cachedAt < this._cacheTtlMs;
    if (isFresh && cached && cached.length > 0) {
      return cached.filter((c) => c.timestamp <= toTs).slice(-count);
    }

    const candles = await fetchBinanceCandles(this._symbol, interval, count, toTs);
    this._cache.set(cacheKey, candles);
    this._cacheTs.set(cacheKey, Date.now());
    return candles.slice(-count);
  }

  /**
   * Return the most recent `count` closed candles for the TF.
   * Delegates to `getCandles` (uses cache if fresh).
   */
  async getLatestCandles(tf: TfId, count = DEFAULT_LIMIT): Promise<Candle[]> {
    return this.getCandles(tf, Date.now(), count);
  }

  /** Last close price for the TF (used by indicators as a quick reference). */
  async getLatestClose(tf: TfId): Promise<number | null> {
    const candles = await this.getLatestCandles(tf, 1);
    return candles.length > 0 ? candles[candles.length - 1].close : null;
  }

  /** Drop cached candles for `tf` (or all TFs when `tf` is omitted). */
  invalidateCache(tf?: TfId): void {
    if (tf) {
      this._cache.delete(tf);
      this._cacheTs.delete(tf);
    } else {
      this._cache.clear();
      this._cacheTs.clear();
    }
  }

  get symbol(): string {
    return this._symbol;
  }
}

/**
 * Adapter: satisfies the DnaEngine `CandleProvider` interface by delegation.
 */
export function createBinanceCandleProvider(symbol = BINANCE_SYMBOL): BinanceCandleProvider {
  return new BinanceCandleProvider(symbol);
}
