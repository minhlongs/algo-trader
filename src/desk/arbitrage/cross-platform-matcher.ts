/**
 * Cross-Platform Arbitrage Matcher — Polymarket vs Kalshi
 * Jaccard tokenization, similarity matching, and fee-adjusted edge calculation
 */

import { KalshiMarket } from '../feeds/kalshi-price-feed';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export interface CrossPlatformMatch {
  polymarketId: string;
  polymarketTitle: string;
  polymarketYesPrice: number;
  kalshiTicker: string;
  kalshiTitle: string;
  kalshiYesPrice: number;
  /** Absolute price difference */
  priceDifference: number;
  /** Percentage edge after fees */
  edgePercent: number;
  direction: 'BUY_POLY_YES' | 'BUY_POLY_NO' | 'NEUTRAL';
  /** Match quality 0–1 (Jaccard similarity) */
  confidence: number;
}

export interface CrossPlatformScan {
  matches: CrossPlatformMatch[];
  /** Only matches with edgePercent > threshold */
  opportunities: CrossPlatformMatch[];
  scannedAt: number;
  polymarketCount: number;
  kalshiCount: number;
}

/** Minimal Polymarket market shape required for matching */
export interface PolymarketMarketInput {
  id: string;
  question: string;
  /** YES price normalized 0–1 */
  outcomePrices?: string | string[];
  /** Fallback YES price if outcomePrices unavailable */
  yesPrice?: number;
}

export const POLY_FEE = 0.02; // 2% on profit
export const KALSHI_FEE = 0.03; // ~3% simplified
export const TOTAL_FEE = POLY_FEE + KALSHI_FEE;
export const MATCH_THRESHOLD = 0.5; // min Jaccard similarity to pair markets

// ---------------------------------------------------------------------------
// Title normalization & Jaccard similarity
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation -> token set */
export function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Jaccard: |A ∩ B| / |A ∪ B| */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const tok of a) if (b.has(tok)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

// ---------------------------------------------------------------------------
// Price extraction helpers
// ---------------------------------------------------------------------------

/** Extract YES price (0–1) from Polymarket market input */
export function extractPolyYesPrice(market: PolymarketMarketInput): number {
  if (market.yesPrice !== undefined) return market.yesPrice;
  if (Array.isArray(market.outcomePrices) && market.outcomePrices.length > 0) {
    return parseFloat(market.outcomePrices[0]) || 0;
  }
  if (typeof market.outcomePrices === 'string') {
    try {
      const arr = JSON.parse(market.outcomePrices) as string[];
      return parseFloat(arr[0]) || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Core matching logic
// ---------------------------------------------------------------------------

/** Find best Kalshi match for a Polymarket market by Jaccard similarity */
export function buildMatch(
  poly: PolymarketMarketInput,
  polyTokens: Set<string>,
  kalshiMarkets: KalshiMarket[],
): CrossPlatformMatch | null {
  let bestScore = 0;
  let bestKalshi: KalshiMarket | null = null;

  for (const km of kalshiMarkets) {
    if (km.status !== 'open') continue;
    const score = jaccardSimilarity(polyTokens, tokenize(km.title));
    if (score > bestScore) {
      bestScore = score;
      bestKalshi = km;
    }
  }

  if (!bestKalshi || bestScore < MATCH_THRESHOLD) return null;

  const polyYes = extractPolyYesPrice(poly);
  const kalshiYes = bestKalshi.yesPrice;
  const absDiff = Math.abs(polyYes - kalshiYes);

  // Edge after fees: price diff minus combined fee drag
  const edgePercent = (absDiff - TOTAL_FEE) * 100;

  let direction: CrossPlatformMatch['direction'] = 'NEUTRAL';
  if (polyYes < kalshiYes) direction = 'BUY_POLY_YES'; // cheaper YES on Poly
  else if (polyYes > kalshiYes) direction = 'BUY_POLY_NO'; // cheaper NO on Poly (≈ sell YES)

  return {
    polymarketId: poly.id,
    polymarketTitle: poly.question,
    polymarketYesPrice: polyYes,
    kalshiTicker: bestKalshi.ticker,
    kalshiTitle: bestKalshi.title,
    kalshiYesPrice: kalshiYes,
    priceDifference: absDiff,
    edgePercent,
    direction,
    confidence: bestScore,
  };
}
