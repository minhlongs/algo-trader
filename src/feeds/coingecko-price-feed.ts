/**
 * CoinGecko Price Feed — REST API polling for cryptocurrency market data
 * Public API: https://api.coingecko.com/api/v3
 * Rate limits: 10-30 calls/min for free tier (no API key)
 */

import { logger } from '../utils/logger';
import { getMessageBus } from '../messaging/index';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface CoinGeckoMarket {
  id: string;                    // e.g., 'bitcoin'
  symbol: string;                // e.g., 'btc'
  name: string;                  // e.g., 'Bitcoin'
  currentPrice: number;          // in configured currency (default USD)
  marketCap: number;
  totalVolume: number;
  priceChange24h: number;        // absolute change in last 24h
  priceChangePercentage24h: number;  // percentage change in last 24h
  lastUpdated: number;           // epoch ms
  vsCurrency: string;            // currency price quoted in (e.g., 'usd')
}

export interface CoinGeckoFeed {
  markets: CoinGeckoMarket[];
  fetchedAt: number;
}

export interface HistoricalDataPoint {
  timestamp: number;
  price: number;
}

export interface CoinGeckoHistoricalData {
  id: string;
  currency: string;
  timestamps: number[];
  prices: number[];
}

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.coingecko.com/api/v3';
const NATS_TOPIC = 'market.coingecko.update';
const DEFAULT_POLL_MS = 60_000;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 100;
const DEFAULT_VS_CURRENCY = 'usd';

// Rate limiting: CoinGecko free tier = 10-30 calls/min
// Use 2-second minimum interval to stay under 30 calls/min
const MIN_CALL_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

interface CoinGeckoMarketResponse {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  last_updated: string | null;
}

interface CoinGeckoMarketsResponse {
  markets: CoinGeckoMarketResponse[];
}

interface CoinGeckoHistoricalResponse {
  prices: [number, number][];  // [timestamp_ms, price]
  market_caps?: [number, number][];
  total_volumes?: [number, number][];
}

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private lastCall = 0;

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < MIN_CALL_INTERVAL_MS) {
      const wait = MIN_CALL_INTERVAL_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastCall = Date.now();
  }
}

const rateLimiter = new RateLimiter();

// ---------------------------------------------------------------------------
// Cache Management
// ---------------------------------------------------------------------------

let cache: { data: Map<string, CoinGeckoMarket>; expiresAt: number } | null = null;

const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

function setCache(markets: CoinGeckoMarket[]): void {
  const data = new Map<string, CoinGeckoMarket>(markets.map((m) => [m.id, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

function clearCache(): void {
  cache = null;
  logger.info('[CoinGeckoFeed] Cache cleared');
}

// ---------------------------------------------------------------------------
// Data Normalization
// ---------------------------------------------------------------------------

function normalize(raw: CoinGeckoMarketResponse, vsCurrency: string): CoinGeckoMarket {
  return {
    id: raw.id,
    symbol: raw.symbol,
    name: raw.name,
    currentPrice: raw.current_price ?? 0,
    marketCap: raw.market_cap ?? 0,
    totalVolume: raw.total_volume ?? 0,
    priceChange24h: raw.price_change_24h ?? 0,
    priceChangePercentage24h: raw.price_change_percentage_24h ?? 0,
    lastUpdated: raw.last_updated ? new Date(raw.last_updated).getTime() : Date.now(),
    vsCurrency,
  };
}

// ---------------------------------------------------------------------------
// HTTP Fetch with Error Handling
// ---------------------------------------------------------------------------

async function coingeckoFetch<T>(path: string): Promise<T> {
  // Respect rate limits
  await rateLimiter.waitIfNeeded();

  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`[CoinGeckoFeed] HTTP ${res.status} for ${path}: ${errorText}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API — Market Data
// ---------------------------------------------------------------------------

/**
 * Fetch top cryptocurrencies by market cap from CoinGecko.
 * Returns cached data if TTL is still valid.
 *
 * @param limit - Maximum number of coins to fetch (default 100, max 250)
 * @param vsCurrency - Currency to quote prices in (default 'usd')
 * @returns CoinGeckoFeed with market data
 */
export async function fetchCoinGeckoMarkets(
  limit = DEFAULT_LIMIT,
  vsCurrency = DEFAULT_VS_CURRENCY
): Promise<CoinGeckoFeed> {
  if (isCacheValid()) {
    const markets = Array.from(cache!.data.values());
    return { markets, fetchedAt: cache!.expiresAt - CACHE_TTL_MS };
  }

  logger.debug('[CoinGeckoFeed] Fetching markets from API', { limit, vsCurrency });

  // Clamp limit to CoinGecko's maximum (250 per page)
  const clampedLimit = Math.min(limit, 250);

  try {
    const data = await coingeckoFetch<CoinGeckoMarketsResponse>(
      `/coins/markets?vs_currency=${vsCurrency}&order=market_cap_desc&per_page=${clampedLimit}&page=1`
    );

    const markets = (data.markets ?? []).map((raw) => normalize(raw, vsCurrency));
    setCache(markets);
    logger.info('[CoinGeckoFeed] Markets fetched', { count: markets.length });
    return { markets, fetchedAt: Date.now() };
  } catch (err) {
    logger.error('[CoinGeckoFeed] Failed to fetch markets', { err });
    // Return stale cache if available, otherwise empty result
    if (cache) {
      const markets = Array.from(cache.data.values());
      return { markets, fetchedAt: cache.expiresAt - CACHE_TTL_MS };
    }
    return { markets: [], fetchedAt: Date.now() };
  }
}

/**
 * Fetch current prices for specific coin IDs.
 * Useful when you only need prices without full market data.
 *
 * @param ids - Array of CoinGecko coin IDs (e.g., ['bitcoin', 'ethereum'])
 * @param vsCurrency - Currency to quote prices in (default 'usd')
 * @returns Map of coin ID to price data
 */
export async function fetchCoinGeckoSimplePrices(
  ids: string[],
  vsCurrency = DEFAULT_VS_CURRENCY
): Promise<Map<string, { price: number }>> {
  if (ids.length === 0) return new Map();

  await rateLimiter.waitIfNeeded();

  logger.debug('[CoinGeckoFeed] Fetching simple prices', { ids: ids.length, vsCurrency });

  try {
    const data = await coingeckoFetch<Record<string, Record<string, number>>>(
      `/simple/price?ids=${ids.join(',')}&vs_currencies=${vsCurrency}`
    );

    const result = new Map<string, { price: number }>();
    for (const [id, prices] of Object.entries(data)) {
      result.set(id, { price: prices[vsCurrency] ?? 0 });
    }

    return result;
  } catch (err) {
    logger.error('[CoinGeckoFeed] Failed to fetch simple prices', { ids, err });
    return new Map();
  }
}

/**
 * Fetch historical price data for a specific coin.
 *
 * @param id - CoinGecko coin ID (e.g., 'bitcoin')
 * @param days - Number of days of historical data (1, 7, 14, 30, 90, 365, 'max')
 * @param vsCurrency - Currency to quote prices in (default 'usd')
 * @returns Historical price data with timestamps
 */
export async function fetchCoinGeckoHistoricalData(
  id: string,
  days: number | 'max' = 1,
  vsCurrency = DEFAULT_VS_CURRENCY
): Promise<CoinGeckoHistoricalData> {
  await rateLimiter.waitIfNeeded();

  logger.debug('[CoinGeckoFeed] Fetching historical data', { id, days, vsCurrency });

  try {
    const data = await coingeckoFetch<CoinGeckoHistoricalResponse>(
      `/coins/${id}/market_chart?vs_currency=${vsCurrency}&days=${days}`
    );

    const timestamps = data.prices.map(([ts]) => ts);
    const prices = data.prices.map(([, price]) => price);

    return {
      id,
      currency: vsCurrency,
      timestamps,
      prices,
    };
  } catch (err) {
    logger.error('[CoinGeckoFeed] Failed to fetch historical data', { id, days, err });
    return {
      id,
      currency: vsCurrency,
      timestamps: [],
      prices: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Public API — Convenience Methods
// ---------------------------------------------------------------------------

/**
 * Get latest cached CoinGecko prices without triggering a network call.
 * Returns an empty Map if cache is stale or empty.
 */
export function getLatestCoinGeckoPrices(): Map<string, CoinGeckoMarket> {
  if (!isCacheValid()) return new Map();
  return new Map(cache!.data);
}

/**
 * Get a specific coin by ID from cache.
 * Returns undefined if not in cache or cache expired.
 */
export function getCoinFromCache(id: string): CoinGeckoMarket | undefined {
  if (!isCacheValid()) return undefined;
  return cache!.data.get(id);
}

/**
 * Clear the internal cache.
 * Useful for testing or forcing a refresh.
 */
export function clearCoinGeckoCache(): void {
  clearCache();
}

// ---------------------------------------------------------------------------
// Polling Service
// ---------------------------------------------------------------------------

/**
 * Start polling CoinGecko markets at a configured interval.
 * Publishes CoinGeckoFeed to NATS topic 'market.coingecko.update'.
 *
 * @param intervalMs - Poll interval in ms (default 60s, minimum 5000ms)
 * @param options - Optional configuration
 * @param options.limit - Number of top coins to fetch
 * @param options.vsCurrency - Currency for price quotes
 * @returns Object with stop() method to halt polling
 *
 * @example
 * ```typescript
 * const service = startCoinGeckoPolling(60_000, { limit: 50 });
 * // ... later
 * service.stop();
 * ```
 */
export function startCoinGeckoPolling(
  intervalMs = DEFAULT_POLL_MS,
  options: { limit?: number; vsCurrency?: string } = {}
): { stop: () => void } {
  const { limit = DEFAULT_LIMIT, vsCurrency = DEFAULT_VS_CURRENCY } = options;

  // Enforce minimum poll interval to respect rate limits
  const safeInterval = Math.max(intervalMs, 5_000);

  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;

    try {
      const feed = await fetchCoinGeckoMarkets(limit, vsCurrency);

      // Publish to NATS if message bus is connected
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish(NATS_TOPIC, feed, 'coingecko-feed');
          logger.debug('[CoinGeckoFeed] Published to NATS', {
            count: feed.markets.length,
            topic: NATS_TOPIC,
          });
        } else {
          logger.debug('[CoinGeckoFeed] NATS not connected, skipping publish');
        }
      } catch (busErr) {
        logger.warn('[CoinGeckoFeed] NATS publish failed', { err: busErr });
      }
    } catch (err) {
      logger.error('[CoinGeckoFeed] Poll failed', { err });
    } finally {
      if (running) {
        timerId = setTimeout(poll, safeInterval);
      }
    }
  }

  // Initial poll
  poll().catch((err) => logger.error('[CoinGeckoFeed] Initial poll error', { err }));

  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[CoinGeckoFeed] Polling stopped');
    },
  };
}

/**
 * Get NATS topic name for CoinGecko feed updates.
 * Useful for subscribing to feed updates.
 */
export function getCoinGeckoNatsTopic(): string {
  return NATS_TOPIC;
}
