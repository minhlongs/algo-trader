import { RateLimiter } from './rate-limiter';
import {
  CoinGeckoMarket,
  CoinGeckoFeed,
  CoinGeckoHistoricalData,
  CoinGeckoMarketsResponse,
  CoinGeckoHistoricalResponse,
} from './coingecko-types';
import { logger } from '../utils/logger';
import { getMessageBus } from '../messaging/index';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const MIN_CALL_INTERVAL_MS = 2_000;
const DEFAULT_LIMIT = 100;
const DEFAULT_VS_CURRENCY = 'usd';

const rateLimiter = new RateLimiter(MIN_CALL_INTERVAL_MS);

let cache: { data: Map<string, CoinGeckoMarket>; expiresAt: number } | null = null;

export const clearCoinGeckoCache = (): void => {
  cache = null;
  logger.info('[CoinGeckoFeed] Cache cleared');
};

export const getCacheMap = (): Map<string, CoinGeckoMarket> | null => {
  if (cache === null || Date.now() >= cache.expiresAt) return null;
  return new Map(cache!.data);
};

async function coingeckoFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  await rateLimiter.waitIfNeeded();
  const url = `${BASE_URL}${path}`;
  const fetchOptions: RequestInit = {
    signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  };
  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`[CoinGeckoFeed] HTTP ${res.status} for ${path}: ${errorText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCoinGeckoMarkets(
  limit = DEFAULT_LIMIT,
  vsCurrency = DEFAULT_VS_CURRENCY
): Promise<CoinGeckoFeed> {
  const cached = getCacheMap();
  if (cached) {
    return { markets: Array.from(cached.values()), fetchedAt: Date.now() };
  }

  logger.debug('[CoinGeckoFeed] Fetching markets from API', { limit, vsCurrency });
  const clampedLimit = Math.min(limit, 250);

  try {
    const path = `/coins/markets?vs_currency=${vsCurrency}&order=market_cap_desc&per_page=${clampedLimit}&page=1`;
    const data = await coingeckoFetch<CoinGeckoMarketsResponse>(path);
    const markets = (data.markets ?? []).map((raw): CoinGeckoMarket => ({
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
    }));
    cache = { data: new Map(markets.map((m) => [m.id, m])), expiresAt: Date.now() + CACHE_TTL_MS };
    logger.info('[CoinGeckoFeed] Markets fetched', { count: markets.length });
    return { markets, fetchedAt: Date.now() };
  } catch (err) {
    logger.error('[CoinGeckoFeed] Failed to fetch markets', { err });
    const stale = getCacheMap();
    return { markets: stale ? Array.from(stale.values()) : [], fetchedAt: Date.now() };
  }
}

export async function fetchCoinGeckoSimplePrices(
  ids: string[],
  vsCurrency = DEFAULT_VS_CURRENCY
): Promise<Map<string, { price: number }>> {
  if (ids.length === 0) return new Map();
  try {
    logger.debug('[CoinGeckoFeed] Fetching simple prices', { ids: ids.length, vsCurrency });
    const path = `/simple/price?ids=${ids.join(',')}&vs_currencies=${vsCurrency}`;
    const data = await coingeckoFetch<Record<string, Record<string, number>>>(path);
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

export async function fetchCoinGeckoHistoricalData(
  id: string,
  days: number | 'max' = 1,
  vsCurrency = DEFAULT_VS_CURRENCY
): Promise<CoinGeckoHistoricalData> {
  try {
    logger.debug('[CoinGeckoFeed] Fetching historical data', { id, days, vsCurrency });
    const path = `/coins/${id}/market_chart?vs_currency=${vsCurrency}&days=${days}`;
    const data = await coingeckoFetch<CoinGeckoHistoricalResponse>(path);
    const timestamps = data.prices.map(([ts]) => ts);
    const prices = data.prices.map(([, price]) => price);
    return { id, currency: vsCurrency, timestamps, prices };
  } catch (err) {
    logger.error('[CoinGeckoFeed] Failed to fetch historical data', { id, days, err });
    return { id, currency: vsCurrency, timestamps: [], prices: [] };
  }
}

export function getLatestCoinGeckoPrices(): Map<string, CoinGeckoMarket> {
  const cached = getCacheMap();
  return cached ? new Map(cached) : new Map();
}

export function getCoinFromCache(id: string): CoinGeckoMarket | undefined {
  return getCacheMap()?.get(id);
}

export function startCoinGeckoPolling(
  intervalMs = 60_000,
  options: { limit?: number; vsCurrency?: string } = {}
): { stop: () => void } {
  const { limit = DEFAULT_LIMIT, vsCurrency = DEFAULT_VS_CURRENCY } = options;
  const safeInterval = Math.max(intervalMs, 5_000);
  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const feed = await fetchCoinGeckoMarkets(limit, vsCurrency);
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish('market.coingecko.update', feed, 'coingecko-feed');
          logger.debug('[CoinGeckoFeed] Published to NATS', {
            count: feed.markets.length,
            topic: 'market.coingecko.update',
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
      if (running) timerId = setTimeout(poll, safeInterval);
    }
  }

  poll().catch((err) => logger.error('[CoinGeckoFeed] Initial poll error', { err }));

  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[CoinGeckoFeed] Polling stopped');
    },
  };
}

export function getCoinGeckoNatsTopic(): string {
  return 'market.coingecko.update';
}
