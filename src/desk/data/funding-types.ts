/**
 * Funding Rate Types
 *
 * Shared row/stats interfaces for the funding_rates table (Binance Futures).
 * Split out of funding-store.ts so the store module stays focused on
 * upsert/read and the quality module can reuse the same shapes.
 */

export interface FundingRateRow {
  symbol: string;
  exchange: string;
  fundingTime: Date;
  fundingRate: number;
  markPrice?: number;
  rateType?: string;
  retrievedAt: Date;
  sourceUrl: string;
}

export interface DbFundingRateRow {
  symbol: string;
  exchange: string;
  funding_time: Date;
  funding_rate: string;
  mark_price: string | null;
  rate_type: string | null;
  retrieved_at: Date;
  source_url: string;
}

export interface FundingStoreStats {
  fetched: number;
  stored: number;
  /** Rows that genuinely inserted (did not exist before this call). */
  inserted: number;
  duplicatesSkipped: number;
  oldest: Date | null;
  newest: Date | null;
}
