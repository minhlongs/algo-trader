/**
 * Binance REST Candle Fetcher — fetches and parses kline data from Binance API.
 * Oldest-first chronological ordering invariant.
 */

import type { Candle } from './multi-tf-types';

export type BinanceKline = [
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

export interface KlinePayload {
  symbol: string;
  interval: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export const BINANCE_REST = 'https://api.binance.com';
export const BINANCE_SYMBOL = 'BTCUSDT';
export const FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_LIMIT = 300;

export function toCandle(k: BinanceKline): Candle {
  return {
    timestamp: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  };
}

export function buildKlineUrl(payload: KlinePayload): string {
  const p = new URLSearchParams({
    symbol: payload.symbol,
    interval: payload.interval,
    limit: String(payload.limit ?? DEFAULT_LIMIT),
  });
  if (payload.startTime !== undefined) p.set('startTime', String(payload.startTime));
  if (payload.endTime !== undefined) p.set('endTime', String(payload.endTime));
  return `${BINANCE_REST}/api/v3/klines?${p.toString()}`;
}

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
