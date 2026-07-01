/**
 * Smarkets Price Feed — public REST API v3, no auth required.
 * Events API: https://api.smarkets.com/v3/events/?state=new&state=upcoming&state=live&type=politics
 * Quotes API: https://api.smarkets.com/v3/markets/{id}/quotes/
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants & raw API shapes
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.smarkets.com/v3';
const EVENTS_PATH = '/events/?state=new&state=upcoming&state=live&type=politics';
const NATS_TOPIC = 'market.smarkets.update';
const DEFAULT_POLL_MS = 60_000;
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;
/** Max parallel quote fetches to avoid hammering the API */
const QUOTE_CONCURRENCY = 5;

interface SmarketsRawEvent {
  id?: string;
  name?: string;
  markets?: SmarketsRawMarketRef[];
}

interface SmarketsRawMarketRef {
  id?: string;
  name?: string;
  volume_matched?: string;   // decimal string, e.g. "123.45"
}

interface SmarketsEventsResponse {
  events?: SmarketsRawEvent[];
}

interface SmarketsQuoteContract {
  id?: string;
  // Smarkets quotes use decimal odds; we convert to implied probability
  best_buy_price?: string;   // e.g. "0.72" (decimal, already probability 0–1)
  best_sell_price?: string;
}

interface SmarketsQuotesResponse {
  contracts?: SmarketsQuoteContract[];
}

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
// Helpers
// ---------------------------------------------------------------------------

/** Parse Smarkets price strings. Values are already probabilities (0–1). */
function parseProb(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val);
  if (isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

async function smarketsFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`[SmarketsFeed] HTTP ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/**
 * Fetch quotes for a single market and return a normalized SmarketsMarket.
 * Binary contracts: first contract = YES, complement price = NO.
 */
async function fetchMarketQuotes(
  marketId: string,
  marketName: string,
  volume: number,
): Promise<SmarketsMarket | null> {
  try {
    const data = await smarketsFetch<SmarketsQuotesResponse>(
      `/markets/${marketId}/quotes/`,
    );
    const contracts = data.contracts ?? [];
    if (contracts.length === 0) return null;

    // For binary markets, use the first contract's best buy price as yes probability
    const first = contracts[0];
    const yesPrice = parseProb(first.best_buy_price);
    const noPrice = contracts.length > 1
      ? parseProb(contracts[1].best_buy_price)
      : Math.max(0, 1 - yesPrice);

    return {
      id: marketId,
      title: marketName,
      yesPrice,
      noPrice,
      volume,
      platform: 'smarkets',
      lastUpdated: Date.now(),
    };
  } catch (err) {
    logger.warn('[SmarketsFeed] Failed to fetch quotes', { marketId, err });
    return null;
  }
}

/** Run at most `concurrency` promises in parallel. */
async function pooledMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map(fn));
    results.push(...settled);
  }
  return results;
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

  logger.debug('[SmarketsFeed] Fetching events from API');
  const eventsData = await smarketsFetch<SmarketsEventsResponse>(EVENTS_PATH);
  const events = eventsData.events ?? [];

  // Collect all market refs from all events
  type MarketRef = { id: string; name: string; volume: number };
  const marketRefs: MarketRef[] = events.flatMap((ev) =>
    (ev.markets ?? [])
      .filter((m) => m.id)
      .map((m) => ({
        id: m.id!,
        name: m.name ?? ev.name ?? '',
        volume: parseFloat(m.volume_matched ?? '0') || 0,
      })),
  );

  logger.debug('[SmarketsFeed] Fetching quotes', { marketCount: marketRefs.length });
  const results = await pooledMap(
    marketRefs,
    (ref) => fetchMarketQuotes(ref.id, ref.name, ref.volume),
    QUOTE_CONCURRENCY,
  );

  const markets = results.filter((m): m is SmarketsMarket => m !== null);
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
