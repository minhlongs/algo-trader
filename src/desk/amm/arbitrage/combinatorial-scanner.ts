/**
 * Combinatorial Negative-Risk & Basket Mispricing Scanner
 * Detects overpriced and underpriced outcome baskets across N >= 2 to N = 10+ outcomes,
 * identifying full basket mispricings and mutually exclusive sub-basket opportunities.
 */

import { logger } from '../../../shared/utils/logger';
import { MultiTokenPool } from '../pool/multi-token-pool';
import { MultiOutcomeMarket, OrderbookSnapshot, OutcomeTokenState } from '../types/amm-types';
import { ArbitrageLeg, ArbitrageOpportunity, ArbitrageType } from '../types/arbitrage-types';

export interface MarketQuotesInput {
  bids: number[];
  asks: number[];
  bidDepths?: number[];
  askDepths?: number[];
}

export type QuoteSource = MarketQuotesInput | OrderbookSnapshot[] | Map<number, OrderbookSnapshot> | MultiTokenPool;

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
    const n = market.outcomes.length;
    if (source && 'bids' in source && Array.isArray(source.bids)) {
      return {
        bids: [...source.bids],
        asks: [...source.asks],
        bidDepths: source.bidDepths ? [...source.bidDepths] : new Array(n).fill(1000),
        askDepths: source.askDepths ? [...source.askDepths] : new Array(n).fill(1000),
      };
    }
    if (source instanceof MultiTokenPool) {
      const spots = source.getSpotPrices();
      return {
        bids: spots.map((p) => Number((p * 0.995).toFixed(4))),
        asks: spots.map((p) => Number((p * 1.005).toFixed(4))),
        bidDepths: new Array(n).fill(1000),
        askDepths: new Array(n).fill(1000),
      };
    }
    const books = Array.isArray(source) ? source : source instanceof Map ? Array.from(source.values()) : [];
    const [bids, asks] = [new Array(n).fill(0), new Array(n).fill(1)];
    const [bidDepths, askDepths] = [new Array(n).fill(1000), new Array(n).fill(1000)];

    for (const snap of books) {
      const idx = snap.outcomeIndex;
      if (idx >= 0 && idx < n) {
        if (snap.bids.length > 0) { bids[idx] = snap.bids[0].price; bidDepths[idx] = snap.bids[0].size; }
        if (snap.asks.length > 0) { asks[idx] = snap.asks[0].price; askDepths[idx] = snap.asks[0].size; }
      }
    }
    for (let i = 0; i < n; i++) {
      const o = market.outcomes[i] as Partial<OutcomeTokenState>;
      if (bids[i] === 0 && o.clobBestBid !== undefined) { bids[i] = o.clobBestBid; bidDepths[i] = o.clobBidDepth ?? 1000; }
      if (asks[i] === 1 && o.clobBestAsk !== undefined) { asks[i] = o.clobBestAsk; askDepths[i] = o.clobAskDepth ?? 1000; }
    }
    return { bids, asks, bidDepths, askDepths };
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
    const netProfitUsd = Number((netEdge * maxSets).toFixed(4));
    logger.debug('[CombinatorialScanner] Detected mispricing', {
      marketId: market.marketId, type, grossEdge: Number(grossEdge.toFixed(4)), netEdge: Number(netEdge.toFixed(4)),
    });
    return {
      id: `arb-${market.marketId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      marketId: market.marketId,
      conditionId: market.conditionId,
      type,
      legs,
      grossEdge: Number(grossEdge.toFixed(6)),
      estimatedFeesUsdc: Number(fees.toFixed(6)),
      estimatedGasUsd: 0.05,
      netEdge: Number(netEdge.toFixed(6)),
      netProfitUsd,
      maxExecutableSets: maxSets,
      timestampMs: Date.now(),
    };
  }
}
