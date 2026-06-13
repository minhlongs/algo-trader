/**
 * Binance REST Candle Provider — plugs into DnaEngine CandleProvider interface.
 *
 * Uses public Binance klines API (no key required).
 * Maps Binance kline tuple → DNA Candle type.
 *
 * TF mapping:
 * DNA tf  → Binance interval
 * '1m'    → '1m'
 * '5m'    → '5m'
 * '15m'   → '15m'
 * '1h'    → '1h'
 * '4h'    → '4h'
 * '1d'    → '1d'
 */

import type { Candle, TfId } from './multi-tf-types';
import type { CandleProvider } from './orchestrator';

// ── Types ─────────────────────────────────────────────────────────────────────

type BinanceKline = [
  openTime: number,         // [0]
  open: string,             // [1]
  high: string,             // [2]
  low: string,              // [3]
  close: string,            // [4]
  volume: string,           // [5]
  closeTime: number,        // [6]
  quoteAssetVolume: string, // [7]
  trades: number,           // [8]
  takerBuyBase: string,     // [9]
  takerBuyQuote: string,    // [10]
  ignore: string            // [11]
];

interface KlinePayload {
  symbol: string;
  interval: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BINANCE_REST = 'https://api.binance.com';
const BINANCE_SYMBOL = 'BTCUSDT';
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 300;

const TF_INTERVAL: Record<TfId, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m',
  '1h': '1h', '4h': '4h', '1d': '1d',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCandle(k: BinanceKline): Candle {
  return {
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  };
}

function buildKlineUrl(payload: KlinePayload): string {
  const p = new URLSearchParams({
    symbol: payload.symbol,
    interval: payload.interval,
    limit: String(payload.limit ?? DEFAULT_LIMIT),
  });
  if (payload.startTime !== undefined) p.set('startTime', String(payload.startTime));
  if (payload.endTime !== undefined) p.set('endTime', String(payload.endTime));
  return `${BINANCE_REST}/api/v3/klines?${p.toString()}`;
}

// ── Public fetch API ───────────────────────────────────────────────────────────

/**
 * Fetches candles from Binance and returns them **oldest-first** (oldest → newest).
 *
 * The Binance klines API naturally returns newest-first. We reverse once at the
 * boundary here so the rest of the pipeline works in chronological order. This
 * matches the filter-spec rule: "lọc kline tuples vào Candle theo thứ tự
 * oldest-first (trùng với thứ tự thời gian tăng dần)".
 *
 * Still-open candle (last element of Binance response) is excluded so indicators
 * see only closed bars.
 */
export async function fetchBinanceCandles(
  symbol = BINANCE_SYMBOL,
  interval: string = '1m',
  limit = DEFAULT_LIMIT,
  endTime?: number,
  startTime?: number,
): Promise<Candle[]> {
  const url = buildKlineUrl({ symbol, interval, limit, startTime, endTime });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const resp = await fetch(url, { signal: controller.signal });
  clearTimeout(timer);

  if (!resp.ok) {
    throw new Error(`Binance klines HTTP ${resp.status} for ${symbol}/${interval}`);
  }
  const raw = (await resp.json()) as BinanceKline[];
  // Exclude the still-forming candle (last row) so indicators see only closed bars.
  const closed = raw.slice(0, -1);
  // Reverse to oldest-first (chronological order) — matches the filter-spec rule.
  return closed.map(toCandle).reverse();
}

// ── Provider class ─────────────────────────────────────────────────────────────

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
      // Filter to requested window, oldest-first.
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
    // On an oldest-first array the newest candle is at the tail.
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
