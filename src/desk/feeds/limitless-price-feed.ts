/**
 * Limitless Exchange Price Feed — public REST API polling, no auth required.
 * API: https://api.limitless.exchange/v1/markets
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LimitlessMarket {
  id: string;
  title: string;
  yesPrice: number;   // normalized 0–1
  noPrice: number;    // normalized 0–1
  volume: number;
  platform: 'limitless';
  lastUpdated: number;
}

export interface LimitlessFeed {
  markets: LimitlessMarket[];
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Constants & raw API shapes
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.limitless.exchange/v1';
const NATS_TOPIC = 'market.limitless.update';
const DEFAULT_POLL_MS = 60_000;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

interface LimitlessRawMarket {
  id?: string;
  title?: string;
  question?: string;
  outcomePrices?: string[] | number[];  // [yesCents, noCents] as strings or numbers
  volume?: number;
  volumeFormatted?: string;
  active?: boolean;
  closed?: boolean;
}

interface LimitlessMarketsResponse {
  markets?: LimitlessRawMarket[];
  data?: LimitlessRawMarket[];
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cache: { data: Map<string, LimitlessMarket>; expiresAt: number } | null = null;

const isCacheValid = (): boolean => cache !== null && Date.now() < cache.expiresAt;

function setCache(markets: LimitlessMarket[]): void {
  const data = new Map<string, LimitlessMarket>(markets.map((m) => [m.id, m]));
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse price value which may be string "0.75" or number 75 (cents) */
function parsePrice(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return 0;
  // If value > 1, treat as cents (0–100) → convert to probability
  return n > 1 ? Math.min(1, Math.max(0, n / 100)) : Math.min(1, Math.max(0, n));
}

function normalize(raw: LimitlessRawMarket): LimitlessMarket | null {
  const id = raw.id;
  if (!id) return null;
  const prices = raw.outcomePrices ?? [];
  return {
    id,
    title: raw.title ?? raw.question ?? '',
    yesPrice: parsePrice(prices[0]),
    noPrice: parsePrice(prices[1]),
    volume: raw.volume ?? 0,
    platform: 'limitless',
    lastUpdated: Date.now(),
  };
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
  const raw = data.markets ?? data.data ?? [];
  const markets = raw
    .filter((m) => m.active !== false && !m.closed)
    .map(normalize)
    .filter((m): m is LimitlessMarket => m !== null);
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
