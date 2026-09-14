import type { FundingRateRow } from './funding-types';
import { type BinanceFundingRate, fundingRateToRow } from './binance-funding-types';

/**
 * Parse function exported for unit testing with fixtures.
 * This allows tests to use committed JSON fixtures without hitting the network.
 */
export function parseFundingRateResponse(
  symbol: string,
  data: BinanceFundingRate[],
  sourceUrl: string,
): FundingRateRow[] {
  return data.map((f) => fundingRateToRow(symbol, f, sourceUrl));
}
