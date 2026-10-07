/**
 * Cross-Venue Prediction Market Arbitrage Detector
 *
 * Scans matched contract books across venues (Polymarket, Kalshi, Limitless)
 * and evaluates executable arbitrage spreads net of taker fees.
 *
 * @module desk/arbitrage/cross-venue-arb-detector
 */

import type {
  CrossVenueArbOpportunity,
  MatchedMarketPair,
  VenueQuote,
} from './cross-venue-types';

export class CrossVenueArbDetector {
  private readonly minProfitThresholdUsd: number;
  private readonly minNetSpread: number;

  constructor(options?: { minProfitThresholdUsd?: number; minNetSpread?: number }) {
    this.minProfitThresholdUsd = options?.minProfitThresholdUsd ?? 0.5;
    this.minNetSpread = options?.minNetSpread ?? 0.005; // 0.5%
  }

  public detectArbitrage(pair: MatchedMarketPair): CrossVenueArbOpportunity | null {
    const oppAtoB = this.evaluateDirection(pair.pairId, pair.venueAQuote, pair.venueBQuote);
    const oppBtoA = this.evaluateDirection(pair.pairId, pair.venueBQuote, pair.venueAQuote);

    if (oppAtoB && oppBtoA) {
      return oppAtoB.estimatedNetProfit >= oppBtoA.estimatedNetProfit ? oppAtoB : oppBtoA;
    }
    return oppAtoB ?? oppBtoA;
  }

  public scanBatch(pairs: readonly MatchedMarketPair[]): CrossVenueArbOpportunity[] {
    const results: CrossVenueArbOpportunity[] = [];
    for (const pair of pairs) {
      const opp = this.detectArbitrage(pair);
      if (opp) results.push(opp);
    }
    return results.sort((a, b) => b.estimatedNetProfit - a.estimatedNetProfit);
  }

  private evaluateDirection(
    pairId: string,
    buyQuote: VenueQuote,
    sellQuote: VenueQuote
  ): CrossVenueArbOpportunity | null {
    const buyPrice = buyQuote.bestAsk;
    const sellPrice = sellQuote.bestBid;

    if (buyPrice <= 0 || sellPrice <= 0 || sellPrice <= buyPrice) {
      return null;
    }

    const grossSpread = sellPrice - buyPrice;
    const buyFee = buyPrice * buyQuote.feeRate;
    const sellFee = sellPrice * sellQuote.feeRate;
    const netSpread = grossSpread - (buyFee + sellFee);

    if (netSpread < this.minNetSpread) {
      return null;
    }

    const maxVolume = Math.min(buyQuote.askDepth, sellQuote.bidDepth);
    if (maxVolume <= 0) {
      return null;
    }

    const estimatedNetProfit = maxVolume * netSpread;
    if (estimatedNetProfit < this.minProfitThresholdUsd) {
      return null;
    }

    return {
      pairId,
      buyVenue: buyQuote.venue,
      sellVenue: sellQuote.venue,
      buyPrice,
      sellPrice,
      grossSpread,
      netSpread,
      maxExecutableVolume: maxVolume,
      estimatedNetProfit,
      detectedAt: Date.now(),
    };
  }
}
