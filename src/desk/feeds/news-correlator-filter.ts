/**
 * News Correlator Keyword Pre-Filter
 * Pre-filters markets to reduce expensive LLM scoring calls
 */

import type { ActiveMarket } from './news-impact-analyzer';
import { logger } from '../../shared/utils/logger';

// Define STOP_WORDS statically at module level to avoid re-allocations
export const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'they', 'will', 'have',
  'been', 'when', 'what', 'which', 'were', 'their', 'said',
  'more', 'than', 'about',
]);

// Global cache for keywords of headlines/questions to avoid redundant splits/allocations
export const keywordCache = new Map<string, Set<string>>();

export function getCachedKeywords(text: string): Set<string> {
  let cached = keywordCache.get(text);
  if (!cached) {
    cached = new Set(
      text.toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
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
