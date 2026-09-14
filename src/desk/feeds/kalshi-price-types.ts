export interface KalshiMarket {
  ticker: string; // e.g. "PRES-2028-DEM"
  title: string;
  subtitle: string;
  yesPrice: number; // normalized 0.00–0.99 (Kalshi cents ÷ 100)
  noPrice: number; // normalized 0.00–0.99
  volume: number;
  openInterest: number;
  status: string; // 'open' | 'closed' | 'settled'
  category: string;
  lastUpdated: number; // epoch ms
}

export interface KalshiFeed {
  markets: KalshiMarket[];
  fetchedAt: number;
}

export const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
export const NATS_TOPIC = 'market.kalshi.update';
export const DEFAULT_POLL_MS = 60_000;
export const CACHE_TTL_MS = 60_000;
export const FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_LIMIT = 100;

export interface KalshiRawMarket {
  ticker: string;
  title?: string;
  subtitle?: string;
  yes_bid?: number; // cents 0–99
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume?: number;
  open_interest?: number;
  status?: string;
  category?: string;
}

export interface KalshiMarketsResponse {
  markets?: KalshiRawMarket[];
  cursor?: string;
}

export interface KalshiSingleMarketResponse {
  market?: KalshiRawMarket;
}

/** Convert Kalshi cents (0–99) to decimal probability (0.00–0.99) */
export function centsToProb(cents: number | undefined): number {
  if (typeof cents !== 'number' || isNaN(cents)) return 0;
  return Math.min(0.99, Math.max(0, cents / 100));
}

/** Midpoint of bid/ask, falling back to bid */
export function midPrice(bid: number | undefined, ask: number | undefined): number {
  const b = centsToProb(bid);
  const a = centsToProb(ask);
  return a > 0 ? (b + a) / 2 : b;
}

export function normalize(raw: KalshiRawMarket): KalshiMarket {
  return {
    ticker: raw.ticker,
    title: raw.title ?? '',
    subtitle: raw.subtitle ?? '',
    yesPrice: midPrice(raw.yes_bid, raw.yes_ask),
    noPrice: midPrice(raw.no_bid, raw.no_ask),
    volume: raw.volume ?? 0,
    openInterest: raw.open_interest ?? 0,
    status: raw.status ?? 'unknown',
    category: raw.category ?? '',
    lastUpdated: Date.now(),
  };
}
