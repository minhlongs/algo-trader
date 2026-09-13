/**
 * Cross-Platform Arbitrage Detector — Polymarket vs Kalshi
 * Jaccard title similarity + fee-adjusted edge calculation.
 * Fee model: Poly 2% + Kalshi 3% = 5% total; min net edge 2.5%.
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';
import { getLatestKalshiPrices } from '../feeds/kalshi-price-feed';
import {
  CrossPlatformMatch,
  CrossPlatformScan,
  PolymarketMarketInput,
  tokenize,
  buildMatch,
} from './cross-platform-matcher';

export {
  CrossPlatformMatch,
  CrossPlatformScan,
  PolymarketMarketInput,
  POLY_FEE,
  KALSHI_FEE,
  TOTAL_FEE,
  MATCH_THRESHOLD,
  tokenize,
  jaccardSimilarity,
  extractPolyYesPrice,
  buildMatch,
} from './cross-platform-matcher';

export const NATS_TOPIC = 'signal.cross-platform.candidate';
export const MIN_EDGE_PERCENT = 2.5; // min net edge % to flag as opportunity

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
