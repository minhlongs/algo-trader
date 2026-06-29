/**
 * Kalshi Price Feed — read-only HTTP polling, no auth required.
 * Public endpoints: https://trading-api.readme.io/reference/getevents
 */

import { logger } from '../shared/utils/logger';
import { getMessageBus } from '../shared/messaging/index';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KalshiMarket {
  ticker: string;       // e.g. "PRES-2028-DEM"
  title: string;
  subtitle: string;
  yesPrice: number;     // normalized 0.00–0.99 (Kalshi cents ÷ 100)
  noPrice: number;      // normalized 0.00–0.99
  volume: number;
  openInterest: number;
  status: string;       // 'open' | 'closed' | 'settled'
  category: string;
  lastUpdated: number;  // epoch ms
}

export interface KalshiFeed {
  markets: KalshiMarket[];
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Constants & raw API shapes
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const NATS_TOPIC = 'market.kalshi.update';
const DEFAULT_POLL_MS = 60_000;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;

interface KalshiRawMarket {
  ticker: string;
  title?: string;
  subtitle?: string;
  yes_bid?: number;   // cents 0–99
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  volume?: number;
  open_interest?: number;
  status?: string;
  category?: string;
}

interface KalshiMarketsResponse { markets?: KalshiRawMarket[]; cursor?: string }
interface KalshiSingleMarketResponse { market?: KalshiRawMarket }

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: { data: Map<string, KalshiMarket>; expiresAt: number } | null = null;

export function __resetCacheForTests(): void {
  cache = null;
}

const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

function setCache(markets: KalshiMarket[]): void {
  const data = new Map<string, KalshiMarket>(markets.map((m) => [m.ticker, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Kalshi cents (0–99) to decimal probability (0.00–0.99) */
function centsToProb(cents: number | undefined): number {
  if (typeof cents !== 'number' || isNaN(cents)) return 0;
  return Math.min(0.99, Math.max(0, cents / 100));
}

/** Midpoint of bid/ask, falling back to bid */
function midPrice(bid: number | undefined, ask: number | undefined): number {
  const b = centsToProb(bid);
  const a = centsToProb(ask);
  return a > 0 ? (b + a) / 2 : b;
}

function normalize(raw: KalshiRawMarket): KalshiMarket {
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

async function kalshiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`[KalshiFeed] HTTP ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch list of Kalshi markets. Returns cached data if TTL is valid.
 */
export async function fetchKalshiMarkets(limit = DEFAULT_LIMIT): Promise<KalshiFeed> {
  if (isCacheValid()) {
    const markets = Array.from(cache!.data.values());
    return { markets, fetchedAt: cache!.expiresAt - CACHE_TTL_MS };
  }

  logger.debug('[KalshiFeed] Fetching markets from API', { limit });
  const data = await kalshiFetch<KalshiMarketsResponse>(`/markets?limit=${limit}`);
  const markets = (data.markets ?? []).map(normalize);
  setCache(markets);
  logger.info('[KalshiFeed] Markets fetched', { count: markets.length });
  return { markets, fetchedAt: Date.now() };
}

/**
 * Fetch a single Kalshi market by ticker. Returns null if not found or on error.
 */
export async function fetchKalshiMarket(ticker: string): Promise<KalshiMarket | null> {
  if (isCacheValid() && cache!.data.has(ticker)) return cache!.data.get(ticker)!;

  try {
    logger.debug('[KalshiFeed] Fetching single market', { ticker });
    const data = await kalshiFetch<KalshiSingleMarketResponse>(`/markets/${ticker}`);
    if (!data.market) return null;
    const market = normalize(data.market);
    if (cache) cache.data.set(ticker, market);
    return market;
  } catch (err) {
    logger.warn('[KalshiFeed] Failed to fetch market', { ticker, err });
    return null;
  }
}

/**
 * Get latest cached Kalshi prices without triggering a network call.
 * Returns an empty Map if cache has expired.
 */
export function getLatestKalshiPrices(): Map<string, KalshiMarket> {
  if (!isCacheValid()) return new Map();
  return new Map(cache!.data);
}

/**
 * Start polling Kalshi markets at the given interval.
 * Publishes KalshiFeed to NATS topic 'market.kalshi.update'.
 * @param intervalMs - Poll interval in ms (default 60s, min 1 request/sec)
 * @returns Object with stop() to halt polling
 */
export function startKalshiPolling(intervalMs = DEFAULT_POLL_MS): { stop: () => void } {
  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const feed = await fetchKalshiMarkets();
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish(NATS_TOPIC, feed, 'kalshi-feed');
          logger.debug('[KalshiFeed] Published to NATS', { count: feed.markets.length });
        }
      } catch (busErr) {
        logger.warn('[KalshiFeed] NATS publish failed', { err: busErr });
      }
    } catch (err) {
      logger.error('[KalshiFeed] Poll failed', { err });
    } finally {
      if (running) timerId = setTimeout(poll, intervalMs);
    }
  }

  poll().catch((err) => logger.error('[KalshiFeed] Initial poll error', { err }));
  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[KalshiFeed] Polling stopped');
    },
  };
}
