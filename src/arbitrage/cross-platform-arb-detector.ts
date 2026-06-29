/**
 * Cross-Platform Arbitrage Detector — Polymarket vs Kalshi
 * Jaccard title similarity + fee-adjusted edge calculation.
 * Fee model: Poly 2% + Kalshi 3% = 5% total; min net edge 2.5%.
 */

import { logger } from '../shared/utils/logger';
import { getMessageBus } from '../shared/messaging/index';
import { getLatestKalshiPrices, KalshiMarket } from '../feeds/kalshi-price-feed';

// ---------------------------------------------------------------------------
// Public types
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NATS_TOPIC = 'signal.cross-platform.candidate';
const POLY_FEE = 0.02;         // 2% on profit
const KALSHI_FEE = 0.03;       // ~3% simplified
const TOTAL_FEE = POLY_FEE + KALSHI_FEE;
const MATCH_THRESHOLD = 0.5;   // min Jaccard similarity to pair markets
const MIN_EDGE_PERCENT = 2.5;  // min net edge % to flag as opportunity

// ---------------------------------------------------------------------------
// Title normalization & Jaccard similarity
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation → token set */
function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Jaccard: |A ∩ B| / |A ∪ B| */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
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
function extractPolyYesPrice(market: PolymarketMarketInput): number {
  if (market.yesPrice !== undefined) return market.yesPrice;
  if (Array.isArray(market.outcomePrices) && market.outcomePrices.length > 0) {
    return parseFloat(market.outcomePrices[0]) || 0;
  }
  if (typeof market.outcomePrices === 'string') {
    try {
      const arr = JSON.parse(market.outcomePrices) as string[];
      return parseFloat(arr[0]) || 0;
    } catch { return 0; }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Core matching logic
// ---------------------------------------------------------------------------

/** Find best Kalshi match for a Polymarket market by Jaccard similarity */
function buildMatch(
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
  if (polyYes < kalshiYes) direction = 'BUY_POLY_YES';   // cheaper YES on Poly
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan Polymarket markets against cached Kalshi prices for arbitrage.
 *
 * @param polymarkets - Active Polymarket markets to compare
 * @param minEdge     - Min edge % to classify as opportunity (default 2.5%)
 * @returns CrossPlatformScan with all matches and filtered opportunities
 */
export async function scanCrossPlatformArb(
  polymarkets: PolymarketMarketInput[],
  minEdge = MIN_EDGE_PERCENT,
): Promise<CrossPlatformScan> {
  const kalshiMap = getLatestKalshiPrices();
  const kalshiMarkets = Array.from(kalshiMap.values());

  logger.debug('[CrossPlatformArb] Scanning', {
    polyCount: polymarkets.length,
    kalshiCount: kalshiMarkets.length,
  });

  const matches: CrossPlatformMatch[] = [];

  for (const poly of polymarkets) {
    const tokens = tokenize(poly.question);
    const match = buildMatch(poly, tokens, kalshiMarkets);
    if (match) matches.push(match);
  }

  const opportunities = matches.filter((m) => m.edgePercent > minEdge);

  const scan: CrossPlatformScan = {
    matches,
    opportunities,
    scannedAt: Date.now(),
    polymarketCount: polymarkets.length,
    kalshiCount: kalshiMarkets.length,
  };

  // Publish opportunities to NATS
  if (opportunities.length > 0) {
    try {
      const bus = getMessageBus();
      if (bus.isConnected()) {
        await bus.publish(NATS_TOPIC, scan, 'cross-platform-arb');
        logger.info('[CrossPlatformArb] Published opportunities', {
          count: opportunities.length,
          topic: NATS_TOPIC,
        });
      }
    } catch (err) {
      logger.warn('[CrossPlatformArb] NATS publish failed', { err });
    }
  }

  logger.info('[CrossPlatformArb] Scan complete', {
    matches: matches.length,
    opportunities: opportunities.length,
    minEdge,
  });

  return scan;
}
