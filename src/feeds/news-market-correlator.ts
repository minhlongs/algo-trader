/**
 * News Market Correlator
 * Matches news headlines to relevant Polymarket markets via keyword pre-filter,
 * then calls news-impact-analyzer for DeepSeek scoring.
 * Publishes results to NATS topic `intelligence.news.impact`.
 */

import { fetchNewsItems, analyzeNewsImpact, purgeExpiredCache } from './news-impact-analyzer';
import type { NewsItem, NewsImpactResult, ActiveMarket } from './news-impact-analyzer';
import { getMessageBus } from '../messaging/index';
import { logger } from '../utils/logger';

// Define locally — do NOT modify topic-schema.ts
const INTELLIGENCE_NEWS_IMPACT = 'intelligence.news.impact';

// ---------------------------------------------------------------------------
// Keyword pre-filter (reduces expensive DeepSeek calls)
// ---------------------------------------------------------------------------

// Define STOP_WORDS statically at module level to avoid re-allocations
const STOP_WORDS = new Set(['that','this','with','from','they','will','have',
  'been','when','what','which','were','their','said','more','than','about']);

// Global cache for keywords of headlines/questions to avoid redundant splits/allocations
const keywordCache = new Map<string, Set<string>>();

function getCachedKeywords(text: string): Set<string> {
  let cached = keywordCache.get(text);
  if (!cached) {
    cached = new Set(
      text.toLowerCase()
        .split(/\W+/)
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w)),
    );
    // Limit cache size to prevent memory leaks
    if (keywordCache.size >= 2000) {
      keywordCache.clear();
    }
    keywordCache.set(text, cached);
  }
  return cached;
}

/**
 * Pre-filter markets by keyword overlap with headline.
 * Returns markets that share at least one significant token with the headline,
 * plus a small random sample of others to avoid missing semantic matches.
 */
export function preFilterMarkets(headline: string, markets: ActiveMarket[]): ActiveMarket[] {
  const headlineKw = getCachedKeywords(headline);
  if (headlineKw.size === 0) return markets.slice(0, 20);

  const matched: ActiveMarket[] = [];
  const unmatched: ActiveMarket[] = [];

  for (const market of markets) {
    const marketKw = getCachedKeywords(market.question);
    let overlap = false;
    for (const kw of headlineKw) {
      if (marketKw.has(kw)) {
        overlap = true;
        break;
      }
    }
    if (overlap) matched.push(market);
    else unmatched.push(market);
  }

  // Include up to 5 unmatched markets as semantic safety net (DeepSeek catches semantic matches)
  const safetyNet = unmatched.slice(0, 5);

  logger.debug('[NewsMarketCorrelator] Pre-filter result', {
    headline: headline.slice(0, 60),
    matched: matched.length,
    safetyNet: safetyNet.length,
  });

  return [...matched, ...safetyNet];
}

// ---------------------------------------------------------------------------
// NATS publish helper
// ---------------------------------------------------------------------------

async function publishImpact(result: NewsImpactResult): Promise<void> {
  try {
    const bus = getMessageBus();
    if (!bus.isConnected()) return;
    await bus.publish(INTELLIGENCE_NEWS_IMPACT, result, 'news-correlator');
    logger.debug('[NewsMarketCorrelator] Published impact', {
      title: result.newsItem.title.slice(0, 60),
      affected: result.impacts.length,
    });
  } catch (err) {
    // Non-fatal — caller still receives result
    logger.warn('[NewsMarketCorrelator] NATS publish failed', { err });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CorrelatorRunOptions {
  /** Active Polymarket markets to correlate against */
  markets: ActiveMarket[];
  /** If true, publish results to NATS (default: true) */
  publish?: boolean;
  /** Max news items to process per run (default: 10) */
  maxItems?: number;
}

export interface CorrelatorRunResult {
  processed: number;
  totalImpacts: number;
  results: NewsImpactResult[];
}

/**
 * Run full correlation pipeline:
 * 1. Fetch news items
 * 2. Pre-filter markets per headline (keyword match)
 * 3. Call DeepSeek for impact scoring (cached)
 * 4. Publish to NATS
 */
/**
 * Lightweight, zero-dependency concurrency limiter helper
 */
async function runWithLimit<T>(
  limit: number,
  items: unknown[],
  fn: (item: any) => Promise<T>
): Promise<T[]> {
  const results: T[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      results[currentIndex] = await fn(item);
    }
  }

  const numWorkers = Math.min(limit, items.length);
  for (let i = 0; i < numWorkers; i++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}

export async function runNewsMarketCorrelation(
  options: CorrelatorRunOptions,
): Promise<CorrelatorRunResult> {
  const { markets, publish = true, maxItems = 10 } = options;
  purgeExpiredCache();

  // Clear cache at start of run to keep memory clean
  keywordCache.clear();

  logger.info('[NewsMarketCorrelator] Starting correlation run', {
    totalMarkets: markets.length,
    maxItems,
  });

  let newsItems: NewsItem[] = [];
  try {
    newsItems = (await fetchNewsItems()).slice(0, maxItems);
  } catch (err) {
    logger.error('[NewsMarketCorrelator] Failed to fetch news', { err });
    return { processed: 0, totalImpacts: 0, results: [] };
  }

  if (newsItems.length === 0) {
    logger.info('[NewsMarketCorrelator] No news items to process');
    return { processed: 0, totalImpacts: 0, results: [] };
  }

  // Pre-filter candidate markets to avoid processing headlines without candidates
  interface ActiveItemWithCandidates {
    item: NewsItem;
    candidateMarkets: ActiveMarket[];
  }

  const activeItems: ActiveItemWithCandidates[] = [];
  for (const item of newsItems) {
    const candidateMarkets = preFilterMarkets(item.title, markets);
    if (candidateMarkets.length === 0) {
      logger.debug('[NewsMarketCorrelator] No candidate markets', { title: item.title });
      continue;
    }
    activeItems.push({ item, candidateMarkets });
  }

  // Process items concurrently (up to 3 concurrent requests) to prevent DeepSeek/network bottlenecks
  const rawResults = await runWithLimit<NewsImpactResult | null>(
    3,
    activeItems,
    async (entry) => {
      try {
        const result = await analyzeNewsImpact(entry.item, entry.candidateMarkets);
        if (result.impacts.length > 0) {
          if (publish) {
            await publishImpact(result);
          }
          return result;
        }
      } catch (err) {
        logger.error('[NewsMarketCorrelator] Failed to analyze news impact:', err);
      }
      return null;
    }
  );

  const results = rawResults.filter((r): r is NewsImpactResult => r !== null);
  const totalImpacts = results.reduce((sum, r) => sum + r.impacts.length, 0);

  logger.info('[NewsMarketCorrelator] Correlation run complete', {
    processed: newsItems.length,
    withImpacts: results.length,
    totalImpacts,
  });

  return { processed: newsItems.length, totalImpacts, results };
}

/**
 * Correlate a single news headline against markets without fetching from feeds.
 * Useful for ad-hoc or streaming news sources.
 */
export async function correlateHeadline(
  headline: string,
  description: string | undefined,
  markets: ActiveMarket[],
  publish = true,
): Promise<NewsImpactResult> {
  const newsItem: NewsItem = {
    title: headline,
    description,
    publishedAt: Date.now(),
    source: 'direct',
  };

  const candidateMarkets = preFilterMarkets(headline, markets);
  const result = await analyzeNewsImpact(newsItem, candidateMarkets);

  if (result.impacts.length > 0 && publish) {
    await publishImpact(result);
  }

  return result;
}
