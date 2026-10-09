/**
 * Biais et al. (1995) Spread-Conditional Dynamics & Order Flow Momentum.
 * Analyzes market order aggressiveness vs inside-spread limit liquidity provision.
 * Strictly < 180 LOC, zero :any types.
 */

import { LobEvent, LobEventType, SpreadConditionalStats } from './biais-types';

export function analyzeSpreadDynamics(
  events: readonly LobEvent[]
): readonly SpreadConditionalStats[] {
  const tightEvents: LobEvent[] = [];
  const wideEvents: LobEvent[] = [];

  for (const ev of events) {
    if (ev.spreadTicks <= 1) {
      tightEvents.push(ev);
    } else {
      wideEvents.push(ev);
    }
  }

  const computeRegimeStats = (
    subset: readonly LobEvent[],
    regime: 'TIGHT_SPREAD' | 'WIDE_SPREAD'
  ): SpreadConditionalStats => {
    const total = subset.length;
    if (total === 0) {
      return {
        spreadRegime: regime,
        sampleCount: 0,
        marketOrderRatio: 0,
        insideSpreadLimitRatio: 0,
        joinBestQuoteRatio: 0,
      };
    }

    let marketCount = 0;
    let withinCount = 0;
    let bestCount = 0;

    for (const ev of subset) {
      if (ev.type === 'MARKET_BUY' || ev.type === 'MARKET_SELL') {
        marketCount += 1;
      } else if (ev.type === 'LIMIT_BUY_WITHIN' || ev.type === 'LIMIT_SELL_WITHIN') {
        withinCount += 1;
      } else if (ev.type === 'LIMIT_BUY_BEST' || ev.type === 'LIMIT_SELL_BEST') {
        bestCount += 1;
      }
    }

    return {
      spreadRegime: regime,
      sampleCount: total,
      marketOrderRatio: marketCount / total,
      insideSpreadLimitRatio: withinCount / total,
      joinBestQuoteRatio: bestCount / total,
    };
  };

  return [
    computeRegimeStats(tightEvents, 'TIGHT_SPREAD'),
    computeRegimeStats(wideEvents, 'WIDE_SPREAD'),
  ];
}

export function computeOrderFlowMomentum(
  matrix: Record<LobEventType, Record<LobEventType, number>>
): number {
  // Buy momentum: P(Buy | Buy) - P(Sell | Buy)
  const buyToBuy = matrix['MARKET_BUY']['MARKET_BUY'];
  const buyToSell = matrix['MARKET_BUY']['MARKET_SELL'];

  // Sell momentum: P(Sell | Sell) - P(Buy | Sell)
  const sellToSell = matrix['MARKET_SELL']['MARKET_SELL'];
  const sellToBuy = matrix['MARKET_SELL']['MARKET_BUY'];

  // Net persistence momentum index
  return 0.5 * (buyToBuy - buyToSell + (sellToSell - sellToBuy));
}
