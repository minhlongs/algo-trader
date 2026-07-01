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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NegRiskOutcome {
  tokenId: string;
  title: string;
  yesPrice: number;
}

export interface NegRiskOpportunity {
  eventId: string;
  eventTitle: string;
  outcomes: NegRiskOutcome[];
  sumYesPrices: number;
  /** Net edge after 2% Polymarket fee */
  edge: number;
  direction: 'BUY_ALL_YES' | 'SELL_ALL_YES';
}

// Minimal shape we need from Gamma API events
interface GammaEvent {
  id: string;
  title: string;
  markets?: GammaMarket[];
}

interface GammaMarket {
  conditionId?: string;
  clobTokenIds?: string[];
  tokens?: Array<{ token_id?: string; outcome?: string }>;
  question?: string;
  outcomePrices?: string | string[];
  active?: boolean;
  closed?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events?closed=false&limit=100';
const POLY_FEE = 0.02;          // 2% fee on profit
const MIN_OUTCOMES = 2;         // skip binary (true neg-risk has ≥2 outcomes)
const MIN_EDGE = 0.005;         // minimum 0.5% net edge to surface opportunity

// ---------------------------------------------------------------------------
// Price extraction
// ---------------------------------------------------------------------------

function extractYesPrice(market: GammaMarket): number {
  const raw = market.outcomePrices;
  if (Array.isArray(raw) && raw.length > 0) return parseFloat(raw[0]) || 0;
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw) as string[];
      return parseFloat(arr[0]) || 0;
    } catch { return 0; }
  }
  return 0;
}

function extractTokenId(market: GammaMarket): string {
  if (market.clobTokenIds && market.clobTokenIds.length > 0) return market.clobTokenIds[0];
  if (market.tokens && market.tokens.length > 0) return market.tokens[0].token_id ?? '';
  return market.conditionId ?? '';
}

function extractOutcomeTitle(market: GammaMarket, index: number): string {
  if (market.tokens && market.tokens[index]) return market.tokens[index].outcome ?? `Outcome ${index}`;
  return market.question ?? `Outcome ${index}`;
}

// ---------------------------------------------------------------------------
// Core scanner
// ---------------------------------------------------------------------------

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

    // Skip if any price is missing (illiquid / not yet priced)
    if (outcomes.some(o => o.yesPrice <= 0)) continue;

    const sumYesPrices = outcomes.reduce((acc, o) => acc + o.yesPrice, 0);
    const deviation = sumYesPrices - 1.0;
    const absDeviation = Math.abs(deviation);

    // Net edge after fee drag
    const edge = absDeviation - POLY_FEE;
    if (edge < MIN_EDGE) continue;

    const direction: NegRiskOpportunity['direction'] =
      deviation > 0 ? 'SELL_ALL_YES' : 'BUY_ALL_YES';

    opportunities.push({
      eventId: String(event.id),
      eventTitle: event.title,
      outcomes,
      sumYesPrices,
      edge,
      direction,
    });
  }

  return opportunities.sort((a, b) => b.edge - a.edge);
}

// ---------------------------------------------------------------------------
// Fetch + scan entry point
// ---------------------------------------------------------------------------

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
