/**
 * Pure quote extraction and arbitrage opportunity construction helpers for CombinatorialScanner.
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

export type QuoteSource =
  | MarketQuotesInput
  | OrderbookSnapshot[]
  | Map<number, OrderbookSnapshot>
  | MultiTokenPool;

export function extractBasketQuotes(
  market: MultiOutcomeMarket,
  source?: QuoteSource,
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
      if (snap.bids.length > 0) {
        bids[idx] = snap.bids[0].price;
        bidDepths[idx] = snap.bids[0].size;
      }
      if (snap.asks.length > 0) {
        asks[idx] = snap.asks[0].price;
        askDepths[idx] = snap.asks[0].size;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const o = market.outcomes[i] as Partial<OutcomeTokenState>;
    if (bids[i] === 0 && o.clobBestBid !== undefined) {
      bids[i] = o.clobBestBid;
      bidDepths[i] = o.clobBidDepth ?? 1000;
    }
    if (asks[i] === 1 && o.clobBestAsk !== undefined) {
      asks[i] = o.clobBestAsk;
      askDepths[i] = o.clobAskDepth ?? 1000;
    }
  }
  return { bids, asks, bidDepths, askDepths };
}

export function buildArbitrageOpp(
  market: MultiOutcomeMarket,
  type: ArbitrageType,
  legs: ArbitrageLeg[],
  grossEdge: number,
  fees: number,
  netEdge: number,
  maxSets: number,
): ArbitrageOpportunity {
  const netProfitUsd = Number((netEdge * maxSets).toFixed(4));
  logger.debug('[CombinatorialScanner] Detected mispricing', {
    marketId: market.marketId,
    type,
    grossEdge: Number(grossEdge.toFixed(4)),
    netEdge: Number(netEdge.toFixed(4)),
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
