/**
 * Limitless Exchange Price Feed — public REST API polling, no auth required.
 * API: https://api.limitless.exchange/v1/markets
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';
import {
  type LimitlessMarket,
  type LimitlessFeed,
  type LimitlessRawMarket,
  type LimitlessMarketsResponse,
  parsePrice,
  normalize,
  parseActiveLimitlessMarkets,
} from './limitless-price-parsers';

export {
  type LimitlessMarket,
  type LimitlessFeed,
  type LimitlessRawMarket,
  type LimitlessMarketsResponse,
  parsePrice,
  normalize,
  parseActiveLimitlessMarkets,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.limitless.exchange/v1';
const NATS_TOPIC = 'market.limitless.update';
const DEFAULT_POLL_MS = 60_000;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: { data: Map<string, LimitlessMarket>; expiresAt: number } | null = null;

const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

function setCache(markets: LimitlessMarket[]): void {
  const data = new Map<string, LimitlessMarket>(markets.map((m) => [m.id, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

async function limitlessFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`[LimitlessFeed] HTTP ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch active Limitless markets. Returns cached data within TTL. */
export async function fetchLimitlessMarkets(): Promise<LimitlessFeed> {
  if (isCacheValid()) {
    const markets = Array.from(cache!.data.values());
    return { markets, fetchedAt: cache!.expiresAt - CACHE_TTL_MS };
  }

  logger.debug('[LimitlessFeed] Fetching markets from API');
  const data = await limitlessFetch<LimitlessMarketsResponse>('/markets');
  const markets = parseActiveLimitlessMarkets(data);
  setCache(markets);
  logger.info('[LimitlessFeed] Markets fetched', { count: markets.length });
  return { markets, fetchedAt: Date.now() };
}

/** Return latest cached prices without triggering a network call. */
export function getLatestLimitlessPrices(): Map<string, LimitlessMarket> {
  if (!isCacheValid()) return new Map();
  return new Map(cache!.data);
}

/**
 * Start polling Limitless markets at the given interval.
 * Publishes LimitlessFeed to NATS topic 'market.limitless.update'.
 */
export function startLimitlessPolling(intervalMs = DEFAULT_POLL_MS): { stop: () => void } {
  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const feed = await fetchLimitlessMarkets();
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish(NATS_TOPIC, feed, 'limitless-feed');
          logger.debug('[LimitlessFeed] Published to NATS', { count: feed.markets.length });
        }
      } catch (busErr) {
        logger.warn('[LimitlessFeed] NATS publish failed', { err: busErr });
      }
    } catch (err) {
      logger.error('[LimitlessFeed] Poll failed', { err });
    } finally {
      if (running) timerId = setTimeout(poll, intervalMs);
    }
  }

  poll().catch((err) => logger.error('[LimitlessFeed] Initial poll error', { err }));
  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[LimitlessFeed] Polling stopped');
    },
  };
}
