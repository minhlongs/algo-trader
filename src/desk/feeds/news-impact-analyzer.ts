/**
 * News Impact Analyzer
 * Fetches news from RSS/API sources, calls LLM via LlmRouter to assess Polymarket market impact.
 * Publishes impact scores via news-market-correlator.
 *
 * Env: NEWS_FEED_URLS (comma-separated RSS/JSON API URLs)
 */

import { LlmRouter, ChatMessage } from '../../lib/llm-router';
import { logger } from '../../shared/utils/logger';
import type {
  NewsItem,
  MarketImpact,
  NewsImpactResult,
  ActiveMarket,
} from './news-impact-types';

// Re-export types and RSS fetching logic for 100% backward compatibility
export type { NewsItem, MarketImpact, NewsImpactResult, ActiveMarket } from './news-impact-types';
export { fetchNewsItems, fetchRssFeed, parseXmlField } from './news-rss-fetcher';

// ---------------------------------------------------------------------------
// In-memory cache (5-min TTL keyed by headline slug)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;
const analysisCache = new Map<string, { result: NewsImpactResult; expiresAt: number }>();

const cacheKey = (h: string) => h.toLowerCase().replace(/\W+/g, '-').slice(0, 80);

function getFromCache(key: string): NewsImpactResult | null {
  const entry = analysisCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { analysisCache.delete(key); return null; }
  return entry.result;
}

const setInCache = (key: string, result: NewsImpactResult) =>
  analysisCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });

// ---------------------------------------------------------------------------
// LLM call via LlmRouter
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a prediction market analyst. Given a news headline and a list of active Polymarket markets, identify which markets are affected by the news.

Respond ONLY with a JSON array. Each element must have:
- marketId: string (the market's ID from the input list)
- impactDirection: "UP" | "DOWN" | "NEUTRAL"
- magnitude: number from 0.0 to 1.0 (how strongly the market is affected)
- reasoning: string (one sentence max)

Only include markets with magnitude >= 0.1. Output nothing else.`;

async function callLlmForImpact(
  newsItem: NewsItem,
  markets: ActiveMarket[],
): Promise<MarketImpact[]> {
  const router = new LlmRouter();

  const marketList = markets
    .map(m => `ID: ${m.id} | Question: ${m.question}`)
    .join('\n');

  const userContent = `News headline: "${newsItem.title}"${newsItem.description ? `\nDescription: "${newsItem.description}"` : ''}

Active Polymarket markets:
${marketList}

Which of these markets are affected by this news?`;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  const response = await router.chat({
    messages,
    temperature: 0.1,
    maxTokens: 1024,
  });

  const raw = response.content;

  // Extract JSON array from response (model may wrap in markdown)
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  const parsed = JSON.parse(match[0]) as unknown[];
  return parsed.filter(
    (item): item is MarketImpact =>
      typeof item === 'object' && item !== null &&
      'marketId' in item && 'impactDirection' in item && 'magnitude' in item,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a single news item against a list of active markets.
 * Results are cached for 5 minutes to avoid duplicate LLM calls.
 */
export async function analyzeNewsImpact(
  newsItem: NewsItem,
  markets: ActiveMarket[],
): Promise<NewsImpactResult> {
  const key = cacheKey(newsItem.title);
  const cached = getFromCache(key);
  if (cached) {
    logger.debug('[NewsImpactAnalyzer] Cache hit', { title: newsItem.title });
    return cached;
  }

  let impacts: MarketImpact[] = [];
  try {
    impacts = await callLlmForImpact(newsItem, markets);
    logger.info('[NewsImpactAnalyzer] Impact analyzed', {
      title: newsItem.title,
      affectedMarkets: impacts.length,
    });
  } catch (err) {
    logger.error('[NewsImpactAnalyzer] LLM call failed', { err, title: newsItem.title });
  }

  const result: NewsImpactResult = { newsItem, impacts, analyzedAt: Date.now() };
  setInCache(key, result);
  return result;
}

/** Clear expired cache entries (call periodically if running long) */
export function purgeExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of analysisCache) {
    if (now > entry.expiresAt) analysisCache.delete(key);
  }
}
