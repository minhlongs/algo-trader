/**
 * News Correlator Types and Constants
 */

import type { NewsItem, NewsImpactResult, ActiveMarket } from './news-impact-analyzer';

export const INTELLIGENCE_NEWS_IMPACT = 'intelligence.news.impact';

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

export interface ActiveItemWithCandidates {
  item: NewsItem;
  candidateMarkets: ActiveMarket[];
}
