/**
 * News Impact Types
 *
 * Domain types and interfaces for prediction market news impact analysis.
 */

export interface NewsItem {
  title: string;
  description?: string;
  url?: string;
  publishedAt: number;
  source: string;
}

export interface MarketImpact {
  marketId: string;
  impactDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  magnitude: number; // 0–1
  reasoning: string;
}

export interface NewsImpactResult {
  newsItem: NewsItem;
  impacts: MarketImpact[];
  analyzedAt: number;
}

export interface ActiveMarket {
  id: string;
  question: string;
  slug?: string;
}
