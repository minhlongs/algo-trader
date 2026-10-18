/**
 * Pure candle normalization, hour truncation, and Gamma API fetch helpers
 * for the OHLCV Ingestion Job.
 */

import type { OhlcvCandle } from '../data/ohlcv-store';

export const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
export const TIMEFRAME = '1h';
export const EXCHANGE = 'polymarket';

export interface GammaMarket {
  id: string;
  question: string;
  outcomePrices: string; // JSON array of prices
  volume: string;
  liquidity: string;
}

/**
 * Fetch active markets from Gamma API
 */
export async function fetchActiveMarkets(limit = 50): Promise<GammaMarket[]> {
  const url = `${GAMMA_API_BASE}/markets?limit=${limit}&active=true&closed=false`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Gamma API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<GammaMarket[]>;
}

/**
 * Truncate date to start of hour
 */
export function truncateToHour(date: Date): Date {
  const truncated = new Date(date);
  truncated.setMinutes(0, 0, 0);
  return truncated;
}

/**
 * Parse Gamma market into OHLCV candle
 *
 * Gamma provides current outcomePrices (JSON array of yes/no prices).
 * We treat the yes price as "close" and derive OHLV from volume/liquidity.
 */
export function marketToCandle(market: GammaMarket): OhlcvCandle | null {
  try {
    const prices = JSON.parse(market.outcomePrices) as number[];
    if (!prices || prices.length === 0) return null;

    const close = prices[0]; // yes price
    const volume = parseFloat(market.volume) || 0;
    const liquidity = parseFloat(market.liquidity) || 0;

    // Synthetic OHLV from current snapshot
    // In production, would use actual order book depth for H/L
    const spread = liquidity > 1000 ? 0.02 : 0.05; // tighter spread for liquid markets
    const high = Math.min(close + spread, 1.0);
    const low = Math.max(close - spread, 0.0);
    const open = close; // first tick of the hour

    return {
      market: market.id,
      exchange: EXCHANGE,
      timeframe: TIMEFRAME,
      timestamp: truncateToHour(new Date()),
      open,
      high,
      low,
      close,
      volume,
    };
  } catch {
    return null;
  }
}

/**
 * Normalize a batch of Gamma markets into valid OHLCV candles.
 */
export function marketsToCandles(markets: GammaMarket[]): OhlcvCandle[] {
  const candles: OhlcvCandle[] = [];
  for (const market of markets) {
    const candle = marketToCandle(market);
    if (candle) {
      candles.push(candle);
    }
  }
  return candles;
}
