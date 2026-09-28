/**
 * Liquidity Provision & Cross-Market Rebalancing Types
 * Prediction Market AMM Liquidity Engine (Milestone 3)
 */

export interface TwoSidedQuote {
  outcomeId: string;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  spreadBps: number;
  skewOffset: number;
  timestamp: number;
}

export interface QuoterInventoryState {
  holdings: Record<string, number>;
  cashBalanceUsd: number;
  netPortfolioDelta: number;
}

export interface MarketState {
  marketId: string;
  spotPrices: Record<string, number>;
  volatility: number;
  timeToMaturitySec: number;
}

export interface QuoterConfig {
  gamma?: number; // inventory risk aversion
  sigma?: number; // daily outcome volatility
  kappa?: number; // order book liquidity density
  minSpreadBps?: number; // minimum spread in bps
  quoteSize?: number; // default quote quantity
}

export interface RebalanceOrder {
  rebalanceId: string;
  venue: string;
  outcomeId: string;
  side: 'BUY' | 'SELL';
  targetQuantity: number;
  limitPrice: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
}

export type ToxicityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ToxicityAssessment {
  vpin: number;
  toxicityLevel: ToxicityLevel;
  dynamicFeeMultiplier: number;
  shouldTripwirePullQuotes: boolean;
  cooldownPeriodMs: number;
  reason?: string;
}

export interface AdverseSelectionConfig {
  bucketSizeVolume: number;
  windowBucketCount: number;
  vpinWarningThreshold: number;
  vpinCriticalThreshold: number;
  maxDynamicFeeMultiplier: number;
  sweepVelocityThreshold: number; // Volume per 100ms
}
