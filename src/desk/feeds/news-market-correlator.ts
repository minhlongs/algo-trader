/**
 * News Market Correlator
 * Matches news headlines to relevant Polymarket markets via keyword pre-filter,
 * then calls news-impact-analyzer for DeepSeek scoring.
 * Publishes results to NATS topic `intelligence.news.impact`.
 */

import { fetchNewsItems, analyzeNewsImpact, purgeExpiredCache } from './news-impact-analyzer';
import type { NewsItem, NewsImpactResult, ActiveMarket } from './news-impact-analyzer';
import { logger } from '../../shared/utils/logger';
import {
  type CorrelatorRunOptions,
  type CorrelatorRunResult,
  type ActiveItemWithCandidates,
} from './news-correlator-types';
import {
  keywordCache,
  preFilterMarkets,
} from './news-correlator-filter';
import {
  publishImpact,
  runWithLimit,
} from './news-correlator-publish';

export * from './news-correlator-types';
export * from './news-correlator-filter';
export * from './news-correlator-publish';

/**
 * Run full correlation pipeline:
 * 1. Fetch news items
 * 2. Pre-filter markets per headline (keyword match)
 * 3. Call DeepSeek for impact scoring (cached)
 * 4. Publish to NATS
 */
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

  const activeItems: ActiveItemWithCandidates[] = [];
  for (const item of newsItems) {
    const candidateMarkets = preFilterMarkets(item.title, markets);
    if (candidateMarkets.length === 0) {
      logger.debug('[NewsMarketCorrelator] No candidate markets', { title: item.title });
      continue;
    }
    activeItems.push({ item, candidateMarkets });
  }

  const rawResults = await runWithLimit<NewsImpactResult | null>(
    3,
    activeItems,
    async (entry) => {
      const { item, candidateMarkets } = entry as ActiveItemWithCandidates;
      try {
        const result = await analyzeNewsImpact(item, candidateMarkets);
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
    },
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
