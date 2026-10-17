/**
 * Combinatorial Negative-Risk & Basket Mispricing Scanner
 * Detects overpriced and underpriced outcome baskets across N >= 2 to N = 10+ outcomes,
 * identifying full basket mispricings and mutually exclusive sub-basket opportunities.
 */

import { MultiOutcomeMarket } from '../types/amm-types';
import { ArbitrageLeg, ArbitrageOpportunity, ArbitrageType } from '../types/arbitrage-types';
import {
  type MarketQuotesInput,
  type QuoteSource,
  extractBasketQuotes,
  buildArbitrageOpp,
} from './combinatorial-scanner-helpers';

export {
  type MarketQuotesInput,
  type QuoteSource,
  extractBasketQuotes,
  buildArbitrageOpp,
};

export class CombinatorialScanner {
  public static scanBasket(
    market: MultiOutcomeMarket,
    feeBps: number = 0,
    quoteSource?: QuoteSource
  ): ArbitrageOpportunity | null {
    const opportunities = this.scanAll(market, feeBps, quoteSource);
    return opportunities.length > 0 ? opportunities[0] : null;
  }

  public static scanAll(
    market: MultiOutcomeMarket,
    feeBps: number = 0,
    quoteSource?: QuoteSource
  ): ArbitrageOpportunity[] {
    const n = market.outcomes.length;
    if (n < 2) return [];

    const quotes = this.extractQuotes(market, quoteSource);
    const feeRate = feeBps / 10000;
    const opportunities: ArbitrageOpportunity[] = [];

    // 1. Full Overpriced Basket: sum(bids) > 1.00 + fee
    const sumBids = quotes.bids.reduce((a, b) => a + b, 0);
    if (sumBids > 1.0 + feeRate) {
      const gross = sumBids - 1.0;
      const fees = sumBids * feeRate;
      const netEdge = gross - fees;
      if (netEdge > 0) {
        const maxSets = Math.min(...quotes.bidDepths);
        const legs: ArbitrageLeg[] = quotes.bids.map((p, i) => ({
          outcomeIndex: i, outcomeSymbol: market.outcomes[i].symbol, action: 'SELL', price: p, size: maxSets, venue: 'CLOB',
        }));
        opportunities.push(this.buildOpp(market, 'OVERPRICED_BASKET', legs, gross, fees, netEdge, maxSets));
      }
    }

    // 2. Full Underpriced Basket: sum(asks) < 1.00 - fee
    const sumAsks = quotes.asks.reduce((a, b) => a + b, 0);
    if (sumAsks < 1.0 - feeRate) {
      const gross = 1.0 - sumAsks;
      const fees = sumAsks * feeRate;
      const netEdge = gross - fees;
      if (netEdge > 0) {
        const maxSets = Math.min(...quotes.askDepths);
        const legs: ArbitrageLeg[] = quotes.asks.map((p, i) => ({
          outcomeIndex: i, outcomeSymbol: market.outcomes[i].symbol, action: 'BUY', price: p, size: maxSets, venue: 'CLOB',
        }));
        opportunities.push(this.buildOpp(market, 'UNDERPRICED_BASKET', legs, gross, fees, netEdge, maxSets));
      }
    }

    // 3. Mutually Exclusive Sub-Basket Mispricing (N >= 3)
    if (n >= 3) opportunities.push(...this.scanSubBaskets(market, feeBps, quoteSource));

    opportunities.sort((a, b) => b.netEdge - a.netEdge);
    return opportunities;
  }

  public static scanSubBaskets(
    market: MultiOutcomeMarket,
    feeBps: number = 0,
    quoteSource?: QuoteSource
  ): ArbitrageOpportunity[] {
    const n = market.outcomes.length;
    if (n < 3) return [];
    const quotes = this.extractQuotes(market, quoteSource);
    const feeRate = feeBps / 10000;
    const subOpps: ArbitrageOpportunity[] = [];

    const indexedBids = quotes.bids.map((price, index) => ({ index, price })).sort((a, b) => b.price - a.price);

    for (let k = 2; k < n; k++) {
      const subset = indexedBids.slice(0, k);
      const subSum = subset.reduce((acc, item) => acc + item.price, 0);
      if (subSum > 1.0 + feeRate) {
        const gross = subSum - 1.0;
        const fees = subSum * feeRate;
        const netEdge = gross - fees;
        if (netEdge > 0) {
          const maxSets = Math.min(...subset.map((s) => quotes.bidDepths[s.index]));
          const legs: ArbitrageLeg[] = subset.map((s) => ({
            outcomeIndex: s.index, outcomeSymbol: market.outcomes[s.index].symbol, action: 'SELL', price: s.price, size: maxSets, venue: 'CLOB',
          }));
          subOpps.push(this.buildOpp(market, 'SYNTHETIC_DISCREPANCY', legs, gross, fees, netEdge, maxSets));
        }
      }
    }
    return subOpps;
  }

  private static extractQuotes(
    market: MultiOutcomeMarket,
    source?: QuoteSource
  ): { bids: number[]; asks: number[]; bidDepths: number[]; askDepths: number[] } {
    return extractBasketQuotes(market, source);
  }

  private static buildOpp(
    market: MultiOutcomeMarket,
    type: ArbitrageType,
    legs: ArbitrageLeg[],
    grossEdge: number,
    fees: number,
    netEdge: number,
    maxSets: number
  ): ArbitrageOpportunity {
    return buildArbitrageOpp(market, type, legs, grossEdge, fees, netEdge, maxSets);
  }
}
