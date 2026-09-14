import type { FundingRateRow, FundingStoreStats } from './funding-types';

export type { FundingRateRow, FundingStoreStats };

export const BINANCE_FUNDING_API = 'https://fapi.binance.com/fapi/v1/fundingRate';
export const EXCHANGE = 'binance-futures';
export const MAX_PER_REQUEST = 1000; // Binance max per fundingRate request
export const DELAY_MS = 250; // polite delay between paginated requests

/**
 * Binance fundingRate endpoint returns an array of objects:
 * [
 *   {
 *     "symbol": "BTCUSDT",
 *     "fundingTime": 1678540800000,
 *     "fundingRate": "0.0001",
 *     "markPrice": "23000.5",
 *     "rateType": "Regular"
 *   },
 *   ...
 * ]
 */
export type BinanceFundingRate = {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
  markPrice?: string;
  rateType?: string;
};

/**
 * Convert a Binance funding rate object to a FundingRateRow.
 */
export function fundingRateToRow(symbol: string, f: BinanceFundingRate, sourceUrl: string): FundingRateRow {
  return {
    symbol,
    exchange: EXCHANGE,
    fundingTime: new Date(f.fundingTime),
    fundingRate: parseFloat(f.fundingRate),
    markPrice: f.markPrice ? parseFloat(f.markPrice) : undefined,
    rateType: f.rateType,
    retrievedAt: new Date(),
    sourceUrl,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
