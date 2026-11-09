/**
 * Pure quote, spread, and inventory math helpers & types for Market Maker Strategy.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import {
  calcMakerRebateV2,
  calcQuadraticTakerFeeV2,
  type PolymarketCategory,
} from '../../polymarket/polymarket-fee-calculator';
import type {
  LogOddsAsConfig,
  MarketMakerV2Telemetry,
  VolumeSynchronizedVpinEstimator,
} from './market-maker-v2-quoting';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface MarketMakerConfig {
  /** Base spread fraction (0.01 = 1%) around fair value */
  baseSpread: number;
  /** Quote size per side in USDC */
  quoteSizeUsdc: number;
  /** How often to refresh quotes (ms) */
  refreshIntervalMs: number;
  /** Max inventory skew before widening spread */
  maxInventorySkew: number;
  /** Spread multiplier when inventory is maximally skewed */
  skewSpreadMultiplier: number;
  /** Minimum liquidity (USDC) to consider a market */
  minLiquidity: number;
  /** Use Log-Odds Avellaneda-Stoikov pricing instead of linear spread */
  useLogOddsAsQuoting?: boolean;
  /** VPIN kill-switch threshold above which State 3 halts quoting (default 0.70) */
  vpinKillSwitchThreshold?: number;
  /** Volume bucket size in micro-units for VPIN (default 100_000_000 = $100) */
  vpinBucketVolumeMicro?: number;
  /** Rolling bucket window count for VPIN (default 50) */
  vpinRollingWindowBuckets?: number;
  /** Daily Yang-Zhang variance in logit space for Log-Odds AS model */
  yangZhangVarianceDaily?: number;
  /** Optional Log-Odds Avellaneda-Stoikov parameter overrides */
  logOddsConfig?: Partial<LogOddsAsConfig>;
}

export const DEFAULT_CONFIG: MarketMakerConfig = {
  baseSpread: 0.02,
  quoteSizeUsdc: 25,
  refreshIntervalMs: 20_000,
  maxInventorySkew: 3,
  skewSpreadMultiplier: 2.0,
  minLiquidity: 1000,
  useLogOddsAsQuoting: false,
  vpinKillSwitchThreshold: 0.70,
  vpinBucketVolumeMicro: 100_000_000,
  vpinRollingWindowBuckets: 50,
  yangZhangVarianceDaily: 0.04,
};

// ── Per-market state ──────────────────────────────────────────────────────────

export interface MmMarket {
  yesTokenId: string;
  noTokenId?: string;
  conditionId: string;
  volume: number;
  liquidity: number;
}

export interface MakerQuoteEconomicsV2 {
  category: PolymarketCategory;
  bidContracts: number;
  askContracts: number;
  bidRebateUsdc: number;
  askRebateUsdc: number;
  avoidedTakerFeeUsdc: number;
  grossSpreadUsdc: number;
  netMakerEdgeUsdc: number;
}

export interface MmMarketState {
  info: MmMarket;
  fairValue: number;
  confidence: number;
  bidPlaced: number;   // timestamp of last bid
  askPlaced: number;   // timestamp of last ask
  inventorySkew: number; // > 0 = long, < 0 = short
  category?: PolymarketCategory;
  lastQuoteEconomics?: MakerQuoteEconomicsV2;
  cumulativeRebateUsdc?: number;
  cumulativeAvoidedTakerFeeUsdc?: number;
  prevBook?: RawOrderBook;
  vpinEstimator?: VolumeSynchronizedVpinEstimator;
  vpinOverride?: number;
  v2Telemetry?: MarketMakerV2Telemetry;
  haltedByToxicRegime?: boolean;
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute bid price with skew-adjusted spread. */
export function computeBidPrice(
  fairValue: number,
  spread: number,
  skew: number,
  skewMultiplier: number,
): number {
  const adjustedSpread = spread * (1 + Math.max(0, skew) * (skewMultiplier - 1) / 3);
  return Math.max(0.01, fairValue - adjustedSpread / 2);
}

/** Compute ask price with skew-adjusted spread. */
export function computeAskPrice(
  fairValue: number,
  spread: number,
  skew: number,
  skewMultiplier: number,
): number {
  const adjustedSpread = spread * (1 + Math.max(0, -skew) * (skewMultiplier - 1) / 3);
  return Math.min(0.99, fairValue + adjustedSpread / 2);
}

/** Update inventory skew from trade activity. */
export function updateSkew(currentSkew: number, sideFilled: 'bid' | 'ask'): number {
  return sideFilled === 'bid' ? currentSkew + 1 : currentSkew - 1;
}

/** Extract best bid, ask, and mid price from an order book. */
export function computeBestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

/** Compute CLOB V2 maker rebate and avoided taker fee economics for a two-sided quote. */
export function computeMakerQuoteEconomicsV2(
  bidPrice: number,
  askPrice: number,
  quoteSizeUsdc: number,
  category: PolymarketCategory,
): MakerQuoteEconomicsV2 {
  const safeBid = Math.max(0.01, Math.min(0.99, bidPrice));
  const safeAsk = Math.max(0.01, Math.min(0.99, askPrice));
  const bidContracts = quoteSizeUsdc > 0 ? quoteSizeUsdc / safeBid : 0;
  const askContracts = quoteSizeUsdc > 0 ? quoteSizeUsdc / safeAsk : 0;
  const bidRebateUsdc = calcMakerRebateV2(category, safeBid, bidContracts) * safeBid;
  const askRebateUsdc = calcMakerRebateV2(category, safeAsk, askContracts) * safeAsk;
  const avoidedBidTakerUsdc = calcQuadraticTakerFeeV2(category, safeBid, bidContracts, false) * safeBid;
  const avoidedAskTakerUsdc = calcQuadraticTakerFeeV2(category, safeAsk, askContracts, false) * safeAsk;
  const avoidedTakerFeeUsdc = avoidedBidTakerUsdc + avoidedAskTakerUsdc;
  const pairedContracts = Math.min(bidContracts, askContracts);
  const grossSpreadUsdc = Math.max(0, safeAsk - safeBid) * pairedContracts;
  const netMakerEdgeUsdc = grossSpreadUsdc + bidRebateUsdc + askRebateUsdc + avoidedTakerFeeUsdc;
  return {
    category,
    bidContracts,
    askContracts,
    bidRebateUsdc,
    askRebateUsdc,
    avoidedTakerFeeUsdc,
    grossSpreadUsdc,
    netMakerEdgeUsdc,
  };
}
