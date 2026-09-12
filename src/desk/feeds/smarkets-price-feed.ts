/**
 * Smarkets Price Feed — public REST API v3, no auth required.
 * Events API: https://api.smarkets.com/v3/events/?state=new&state=upcoming&state=live&type=politics
 * Quotes API: https://api.smarkets.com/v3/markets/{id}/quotes/
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';
import {
  NATS_TOPIC,
  DEFAULT_POLL_MS,
  CACHE_TTL_MS,
  type SmarketsMarket,
  type SmarketsFeed,
} from './smarkets-price-types';
import { fetchSmarketsEventsAndQuotes } from './smarkets-quote-fetcher';

export * from './smarkets-price-types';
export * from './smarkets-quote-fetcher';

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: { data: Map<string, SmarketsMarket>; expiresAt: number } | null = null;

const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

function setCache(markets: SmarketsMarket[]): void {
  const data = new Map<string, SmarketsMarket>(markets.map((m) => [m.id, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch political Smarkets markets with quotes. Returns cached data within TTL. */
export async function fetchSmarketsMarkets(): Promise<SmarketsFeed> {
  if (isCacheValid()) {
    const markets = Array.from(cache!.data.values());
    return { markets, fetchedAt: cache!.expiresAt - CACHE_TTL_MS };
  }

  const markets = await fetchSmarketsEventsAndQuotes();
  setCache(markets);
  logger.info('[SmarketsFeed] Markets fetched', { count: markets.length });
  return { markets, fetchedAt: Date.now() };
}

/** Return latest cached prices without triggering a network call. */
export function getLatestSmarketsPrices(): Map<string, SmarketsMarket> {
  if (!isCacheValid()) return new Map();
  return new Map(cache!.data);
}

/**
 * Start polling Smarkets markets at the given interval.
 * Publishes SmarketsFeed to NATS topic 'market.smarkets.update'.
 */
export function startSmarketsPolling(intervalMs = DEFAULT_POLL_MS): { stop: () => void } {
  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const feed = await fetchSmarketsMarkets();
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish(NATS_TOPIC, feed, 'smarkets-feed');
          logger.debug('[SmarketsFeed] Published to NATS', { count: feed.markets.length });
        }
      } catch (busErr) {
        logger.warn('[SmarketsFeed] NATS publish failed', { err: busErr });
      }
    } catch (err) {
      logger.error('[SmarketsFeed] Poll failed', { err });
    } finally {
      if (running) timerId = setTimeout(poll, intervalMs);
    }
  }

  poll().catch((err) => logger.error('[SmarketsFeed] Initial poll error', { err }));
  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[SmarketsFeed] Polling stopped');
    },
  };
}
