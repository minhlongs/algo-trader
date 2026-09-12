/**
 * Smarkets Price Feed Types & Constants
 */

export interface SmarketsMarket {
  id: string;
  title: string;
  yesPrice: number;   // normalized 0–1
  noPrice: number;    // normalized 0–1
  volume: number;
  platform: 'smarkets';
  lastUpdated: number;
}

export interface SmarketsFeed {
  markets: SmarketsMarket[];
  fetchedAt: number;
}

export const BASE_URL = 'https://api.smarkets.com/v3';
export const EVENTS_PATH = '/events/?state=new&state=upcoming&state=live&type=politics';
export const NATS_TOPIC = 'market.smarkets.update';
export const DEFAULT_POLL_MS = 60_000;
export const CACHE_TTL_MS = 60_000;
export const FETCH_TIMEOUT_MS = 10_000;
/** Max parallel quote fetches to avoid hammering the API */
export const QUOTE_CONCURRENCY = 5;

export interface SmarketsRawEvent {
  id?: string;
  name?: string;
  markets?: SmarketsRawMarketRef[];
}

export interface SmarketsRawMarketRef {
  id?: string;
  name?: string;
  volume_matched?: string;   // decimal string, e.g. "123.45"
}

export interface SmarketsEventsResponse {
  events?: SmarketsRawEvent[];
}

export interface SmarketsQuoteContract {
  id?: string;
  // Smarkets quotes use decimal odds; we convert to implied probability
  best_buy_price?: string;   // e.g. "0.72" (decimal, already probability 0–1)
  best_sell_price?: string;
}

export interface SmarketsQuotesResponse {
  contracts?: SmarketsQuoteContract[];
}

export interface MarketRef {
  id: string;
  name: string;
  volume: number;
}
