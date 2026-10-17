/**
 * PredictIt Price Feed — single public endpoint, no auth required.
 * API: https://www.predictit.org/api/marketdata/all/
 * Prices are in cents (0–99); we normalize to 0–1 probability.
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';
import {
  type PredictItMarket,
  type PredictItFeed,
  type PredictItRawContract,
  type PredictItRawMarket,
  type PredictItApiResponse,
  centsToProb,
  normalizeMarket,
  parsePredictItApiResponse,
} from './predictit-price-parsers';

export type {
  PredictItMarket,
  PredictItFeed,
  PredictItRawContract,
  PredictItRawMarket,
  PredictItApiResponse,
};
export { centsToProb, normalizeMarket, parsePredictItApiResponse };

const API_URL = 'https://www.predictit.org/api/marketdata/all/';
const NATS_TOPIC = 'market.predictit.update';
const DEFAULT_POLL_MS = 60_000;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

let cache: { data: Map<string, PredictItMarket>; expiresAt: number } | null = null;

const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

function setCache(markets: PredictItMarket[]): void {
  const data = new Map<string, PredictItMarket>(markets.map((m) => [m.id, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

/** Fetch all active PredictIt markets. Returns cached data within TTL. */
export async function fetchPredictItMarkets(): Promise<PredictItFeed> {
  if (isCacheValid()) {
    const markets = Array.from(cache!.data.values());
    return { markets, fetchedAt: cache!.expiresAt - CACHE_TTL_MS };
  }

  logger.debug('[PredictItFeed] Fetching markets from API');
  const res = await fetch(API_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`[PredictItFeed] HTTP ${res.status}`);
  const data = (await res.json()) as PredictItApiResponse;

  const markets = parsePredictItApiResponse(data);

  setCache(markets);
  logger.info('[PredictItFeed] Markets fetched', { count: markets.length });
  return { markets, fetchedAt: Date.now() };
}

/** Return latest cached prices without triggering a network call. */
export function getLatestPredictItPrices(): Map<string, PredictItMarket> {
  if (!isCacheValid()) return new Map();
  return new Map(cache!.data);
}

/**
 * Start polling PredictIt markets at the given interval.
 * Publishes PredictItFeed to NATS topic 'market.predictit.update'.
 */
export function startPredictItPolling(intervalMs = DEFAULT_POLL_MS): { stop: () => void } {
  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const feed = await fetchPredictItMarkets();
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish(NATS_TOPIC, feed, 'predictit-feed');
          logger.debug('[PredictItFeed] Published to NATS', { count: feed.markets.length });
        }
      } catch (busErr) {
        logger.warn('[PredictItFeed] NATS publish failed', { err: busErr });
      }
    } catch (err) {
      logger.error('[PredictItFeed] Poll failed', { err });
    } finally {
      if (running) timerId = setTimeout(poll, intervalMs);
    }
  }

  poll().catch((err) => logger.error('[PredictItFeed] Initial poll error', { err }));
  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[PredictItFeed] Polling stopped');
    },
  };
}
