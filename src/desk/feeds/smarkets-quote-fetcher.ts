/**
 * Smarkets Quote Fetcher & HTTP helpers
 */

import { logger } from '../../shared/utils/logger';
import {
  BASE_URL,
  EVENTS_PATH,
  FETCH_TIMEOUT_MS,
  QUOTE_CONCURRENCY,
  type SmarketsEventsResponse,
  type SmarketsQuotesResponse,
  type SmarketsMarket,
  type MarketRef,
} from './smarkets-price-types';

/** Parse Smarkets price strings. Values are already probabilities (0–1). */
export function parseProb(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val);
  if (isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export async function smarketsFetch<T>(path: string): Promise<T> {
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
export async function fetchMarketQuotes(
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
export async function pooledMap<T, R>(
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

/** Fetch all events and their quotes from Smarkets API. */
export async function fetchSmarketsEventsAndQuotes(): Promise<SmarketsMarket[]> {
  logger.debug('[SmarketsFeed] Fetching events from API');
  const eventsData = await smarketsFetch<SmarketsEventsResponse>(EVENTS_PATH);
  const events = eventsData.events ?? [];

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

  return results.filter((m): m is SmarketsMarket => m !== null);
}
