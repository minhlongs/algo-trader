/**
 * Neg-Risk Arbitrage Pure Basket Payout, Extraction & Edge Math
 */

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

export interface GammaEvent {
  id: string;
  title: string;
  markets?: GammaMarket[];
}

export interface GammaMarket {
  conditionId?: string;
  clobTokenIds?: string[];
  tokens?: Array<{ token_id?: string; outcome?: string }>;
  question?: string;
  outcomePrices?: string | string[];
  active?: boolean;
  closed?: boolean;
}

export const POLY_FEE = 0.02;          // 2% fee on profit
export const MIN_OUTCOMES = 2;         // skip binary (true neg-risk has ≥2 outcomes)
export const MIN_EDGE = 0.005;         // minimum 0.5% net edge to surface opportunity

export function extractYesPrice(market: GammaMarket): number {
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

export function extractTokenId(market: GammaMarket): string {
  if (market.clobTokenIds && market.clobTokenIds.length > 0) return market.clobTokenIds[0];
  if (market.tokens && market.tokens.length > 0) return market.tokens[0].token_id ?? '';
  return market.conditionId ?? '';
}

export function extractOutcomeTitle(market: GammaMarket, index: number): string {
  if (market.tokens && market.tokens[index]) return market.tokens[index].outcome ?? `Outcome ${index}`;
  return market.question ?? `Outcome ${index}`;
}

export function evaluateNegRiskBasketEdge(
  outcomes: NegRiskOutcome[],
  fee = POLY_FEE,
  minEdge = MIN_EDGE,
): { sumYesPrices: number; edge: number; direction: NegRiskOpportunity['direction'] } | null {
  if (outcomes.some((o) => o.yesPrice <= 0)) return null;
  const sumYesPrices = outcomes.reduce((acc, o) => acc + o.yesPrice, 0);
  const deviation = sumYesPrices - 1.0;
  const edge = Math.abs(deviation) - fee;
  if (edge < minEdge) return null;
  const direction: NegRiskOpportunity['direction'] = deviation > 0 ? 'SELL_ALL_YES' : 'BUY_ALL_YES';
  return { sumYesPrices, edge, direction };
}
