/**
 * Neg-Risk Arbitrage Scanner — detects mispriced multi-outcome events.
 *
 * In Polymarket neg-risk markets (e.g. "Who wins 2028 election?" with N candidates),
 * the sum of all YES prices must equal 1.0.
 *   sum > 1.0 → SELL_ALL_YES (guaranteed profit)
 *   sum < 1.0 → BUY_ALL_YES  (guaranteed profit)
 * After accounting for Polymarket's 2% fee on profit.
 */

import { logger } from '../../shared/utils/logger';
import {
  type NegRiskOutcome,
  type NegRiskOpportunity,
  type GammaEvent,
  type GammaMarket,
  POLY_FEE,
  MIN_OUTCOMES,
  MIN_EDGE,
  extractYesPrice,
  extractTokenId,
  extractOutcomeTitle,
  evaluateNegRiskBasketEdge,
} from './neg-risk-arb-math';

export {
  type NegRiskOutcome,
  type NegRiskOpportunity,
  type GammaEvent,
  type GammaMarket,
  POLY_FEE,
  MIN_OUTCOMES,
  MIN_EDGE,
  extractYesPrice,
  extractTokenId,
  extractOutcomeTitle,
  evaluateNegRiskBasketEdge,
};

const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events?closed=false&limit=100';

/**
 * Scan a list of Gamma events for neg-risk arbitrage opportunities.
 * Each event must have ≥2 active markets (outcomes).
 */
export function scanNegRiskArbitrage(events: GammaEvent[]): NegRiskOpportunity[] {
  const opportunities: NegRiskOpportunity[] = [];

  for (const event of events) {
    const markets = (event.markets ?? []).filter(m => !m.closed && m.active !== false);
    if (markets.length < MIN_OUTCOMES) continue;

    const outcomes: NegRiskOutcome[] = markets.map((m, i) => ({
      tokenId: extractTokenId(m),
      title: extractOutcomeTitle(m, i),
      yesPrice: extractYesPrice(m),
    }));

    const evaluation = evaluateNegRiskBasketEdge(outcomes, POLY_FEE, MIN_EDGE);
    if (!evaluation) continue;

    opportunities.push({
      eventId: String(event.id),
      eventTitle: event.title,
      outcomes,
      sumYesPrices: evaluation.sumYesPrices,
      edge: evaluation.edge,
      direction: evaluation.direction,
    });
  }

  return opportunities.sort((a, b) => b.edge - a.edge);
}

/**
 * Fetch active events from Gamma API then scan for neg-risk opportunities.
 * Returns sorted opportunities (highest edge first).
 */
export async function fetchAndScanNegRisk(): Promise<NegRiskOpportunity[]> {
  logger.info('[NegRiskArb] Fetching events from Gamma API');

  let events: GammaEvent[] = [];

  try {
    const response = await fetch(GAMMA_EVENTS_URL);
    if (!response.ok) {
      throw new Error(`Gamma API ${response.status}: ${response.statusText}`);
    }
    const raw = await response.json() as GammaEvent[] | { events?: GammaEvent[] };
    events = Array.isArray(raw) ? raw : (raw.events ?? []);
  } catch (err) {
    logger.error('[NegRiskArb] Failed to fetch Gamma events', { err });
    return [];
  }

  logger.debug('[NegRiskArb] Events fetched', { count: events.length });

  const opportunities = scanNegRiskArbitrage(events);

  logger.info('[NegRiskArb] Scan complete', {
    eventsScanned: events.length,
    opportunities: opportunities.length,
    topEdge: opportunities[0]?.edge?.toFixed(4) ?? 'none',
  });

  return opportunities;
}
