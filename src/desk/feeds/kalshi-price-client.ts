import { logger } from '../../shared/utils/logger';
import {
  type KalshiMarket,
  type KalshiFeed,
  type KalshiMarketsResponse,
  type KalshiSingleMarketResponse,
  BASE_URL,
  CACHE_TTL_MS,
  FETCH_TIMEOUT_MS,
  DEFAULT_LIMIT,
  normalize,
} from './kalshi-price-types';

let cache: { data: Map<string, KalshiMarket>; expiresAt: number } | null = null;

export function __resetCacheForTests(): void {
  cache = null;
}

export const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

export function setCache(markets: KalshiMarket[]): void {
  const data = new Map<string, KalshiMarket>(markets.map((m) => [m.ticker, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

export async function kalshiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`[KalshiFeed] HTTP ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

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
