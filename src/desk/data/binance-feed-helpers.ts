import type { OhlcvCandle } from '../data/ohlcv-store';
import { logger } from '../../shared/utils/logger';
import { BINANCE_API, EXCHANGE } from './binance-feed-types';
import type { BinanceKline } from './binance-feed-types';

export function intervalToMs(interval: string): number {
  const unit = interval[interval.length - 1]?.toUpperCase();
  const value = parseInt(interval, 10) || 1;
  switch (unit) {
    case 'M': return value * 60 * 1000;
    case 'H': return value * 60 * 60 * 1000;
    case 'D': return value * 24 * 60 * 60 * 1000;
    case 'W': return value * 7 * 24 * 60 * 60 * 1000;
    default:
      logger.warn(`[BinanceFeed] Unrecognized interval "${interval}", defaulting to 1h`);
      return 60 * 60 * 1000;
  }
}

export async function fetchKlinesPage(
  binanceSymbol: string,
  startTime: number,
  endTime: number,
  limit: number,
  timeframe: string
): Promise<BinanceKline[]> {
  const url = new URL(BINANCE_API);
  url.searchParams.set('symbol', binanceSymbol);
  url.searchParams.set('interval', timeframe);
  url.searchParams.set('startTime', String(startTime));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', String(limit));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Binance API error: ${resp.status} ${resp.statusText} for ${url}`);
  }
  return (await resp.json()) as BinanceKline[];
}

export function klineToCandle(symbol: string, k: BinanceKline, timeframe: string): OhlcvCandle {
  return {
    market: symbol,
    exchange: EXCHANGE,
    timeframe,
    timestamp: new Date(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  };
}
