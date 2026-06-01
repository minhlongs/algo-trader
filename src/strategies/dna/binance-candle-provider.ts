/**
 * Binance REST Candle Provider — plugs into DnaEngine CandleProvider interface.
 *
 * Uses public Binance klines API (no key required).
 * Maps Binance kline tuple → DNA Candle type.
 *
 * TF mapping:
 *   DNA tf      → Binance interval
 *   1m          → 1m
 *   5m          → 5m
 *   15m         → 15m
 *   1h          → 1h
 *   4h          → 4h
 *   1d          → 1d
 */
import { Candle, TfId, TF_RESOLUTIONS } from './multi-tf-types';

const BINANCE_KLINES_BASE = 'https://api.binance.com/api/v3/klines';
const DEFAULT_LIMIT = 300; // ~5h of 1m candles
const FETCH_TIMEOUT_MS = 10_000;

// Binance kline tuple: [ openTime, open, high, low, close, volume, closeTime, ... ]
type BinanceKline = [
  number, // 0  openTime (ms)
  string, // 1  open
  string, // 2  high
  string, // 3  low
  string, // 4  close
  string, // 5  volume
  number, // 6  closeTime (ms)
  string, // 7  quoteAssetVolume
  number, // 8  numberOfTrades
  string, // 9  takerBuyBaseAssetVolume
  string, // 10 takerBuyQuoteAssetVolume
  string, // 11 ignore
];

/** Public Binance symbol for BTCUSDT. Change if trading a different pair. */
export const BINANCE_SYMBOL = 'BTCUSDT';

/** Map DNA TF id → Binance kline interval string. */
const TF_TO_BINANCE_INTERVAL: Record<TfId, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
};

function toCandle(kline: BinanceKline): Candle {
  return {
    timestamp: kline[0],
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
  };
}

/**
 * Fetches candles from Binance and returns them newest-first (matches engine convention).
 * Excludes the still-open candle (last element) so indicators only see closed candles.
 */
export async function fetchBinanceCandles(
  symbol = BINANCE_SYMBOL,
  interval: string = '1m',
  limit = DEFAULT_LIMIT,
  endTime?: number,
): Promise<Candle[]> {
  const url = new URL(BINANCE_KLINES_BASE);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));
  if (endTime) url.searchParams.set('endTime', String(endTime));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new Error(`Binance klines HTTP ${resp.status} for ${symbol}/${interval}`);
  }
  const raw = (await resp.json()) as BinanceKline[];
  // Exclude the still-forming candle (last row) so indicators see only closed bars.
  const closed = raw.slice(0, -1);
  return closed.map(toCandle);
}

/**
 * BinanceCandleProvider — implements CandleProvider for DnaEngine.
 *
 * Caches `getLatestCandles` per-TF so multiple TFs can be polled in a single tick
 * without redundant network calls.
 */
export class BinanceCandleProvider {
  private _cache = new Map<TfId, Candle[]>();
  private _cacheTs = new Map<TfId, number>();
  private readonly _cacheTtlMs: number;
  private readonly _symbol: string;

  constructor(symbol = BINANCE_SYMBOL, cacheTtlMs = 30_000) {
    this._symbol = symbol;
    this._cacheTtlMs = cacheTtlMs;
  }

  /**
   * Return candles up to `toTs` (newest-first) for the given TF.
   * Falls back to cache when fresh; fetches from Binance otherwise.
   */
  async getCandles(tf: TfId, toTs: number, count = DEFAULT_LIMIT): Promise<Candle[]> {
    const interval = TF_TO_BINANCE_INTERVAL[tf];
    if (!interval) throw new Error(`Unsupported TF: ${tf}`);

    const cacheKey = tf;
    const cached = this._cache.get(cacheKey);
    const cachedAt = this._cacheTs.get(cacheKey) ?? 0;
    const isFresh = cachedAt && Date.now() - cachedAt < this._cacheTtlMs;

    if (isFresh && cached && cached.length > 0) {
      // Filter to requested window, newest-first.
      return cached.filter((c) => c.timestamp <= toTs).slice(0, count);
    }

    const candles = await fetchBinanceCandles(this._symbol, interval, count, toTs);
    this._cache.set(cacheKey, candles);
    this._cacheTs.set(cacheKey, Date.now());
    return candles;
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
    return candles.length > 0 ? candles[0].close : null;
  }

  /** Clears the per-TF cache — call after each successful tick if you want hard freshness. */
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
