/**
 * Opportunity normalization and parameter extraction for the arbitrage engine.
 *
 * @module desk/arbitrage/engine/arbitrage-engine-normalizer
 */

import type { ArbitrageOpportunity as SpreadArbitrageOpportunity } from '../spread-detector-types';
import type { ArbitrageOpportunity } from './arbitrage-engine-types';

export interface ExtractedOpportunityParams {
  buyVenue: string;
  sellVenue: string;
  symbol: string;
  buyPrice: number;
  sellPrice: number;
  amount: number;
}

/**
 * Extract canonical parameters from heterogeneous opportunity input formats.
 */
export function extractOpportunityParams(opp: ArbitrageOpportunity): ExtractedOpportunityParams {
  const buyVenue =
    opp.buyVenue ??
    opp.buyExchange ??
    opp.venues?.[0] ??
    opp.legs?.find((l) => l.side === 'buy')?.exchange ??
    opp.legs?.find((l) => l.side === 'buy')?.venue ??
    'unknown';

  const sellVenue =
    opp.sellVenue ??
    opp.sellExchange ??
    opp.venues?.[1] ??
    opp.legs?.find((l) => l.side === 'sell')?.exchange ??
    opp.legs?.find((l) => l.side === 'sell')?.venue ??
    'unknown';

  const symbol = opp.symbol ?? opp.legs?.[0]?.symbol ?? 'BTC/USDT';
  const buyPrice = opp.buyPrice ?? opp.legs?.find((l) => l.side === 'buy')?.price ?? 0;
  const sellPrice = opp.sellPrice ?? opp.legs?.find((l) => l.side === 'sell')?.price ?? 0;
  const amount = opp.tradeSize ?? opp.maxTradeSize ?? opp.amount ?? opp.legs?.[0]?.amount ?? 1;

  return { buyVenue, sellVenue, symbol, buyPrice, sellPrice, amount };
}

/**
 * Normalize an ArbitrageOpportunity into a SpreadArbitrageOpportunity for ingestion pipeline.
 */
export function normalizeSpreadOpportunity(opp: ArbitrageOpportunity): SpreadArbitrageOpportunity {
  const buyVenue = opp.buyVenue ?? opp.buyExchange ?? opp.venues?.[0] ?? 'unknown';
  const sellVenue = opp.sellVenue ?? opp.sellExchange ?? opp.venues?.[1] ?? 'unknown';
  const symbol = opp.symbol ?? opp.legs?.[0]?.symbol ?? 'UNKNOWN/USDT';
  const buyPrice = opp.buyPrice ?? opp.legs?.find((l) => l.side === 'buy')?.price ?? 0;
  const sellPrice = opp.sellPrice ?? opp.legs?.find((l) => l.side === 'sell')?.price ?? 0;
  const spread = opp.spread ?? (sellPrice - buyPrice);
  const spreadPercent = opp.spreadPercent ?? (buyPrice > 0 ? (spread / buyPrice) * 100 : 0);

  return {
    id: opp.id,
    symbol,
    buyExchange: buyVenue,
    sellExchange: sellVenue,
    buyPrice,
    sellPrice,
    spread,
    spreadPercent,
    timestamp: opp.timestamp ?? Date.now(),
    latency: 10,
  };
}
