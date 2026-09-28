/**
 * Canonical TypeScript contracts, types, and Zod schemas for
 * Prediction Market AMM & Negative-Risk Arbitrage Engine.
 *
 * Source: PROJECT.md & ORIGINAL_REQUEST.md
 */

import { z } from 'zod';

// ============================================================================
// 1. LMSR Pricing Contracts (M1 / F1-F2)
// ============================================================================

export interface LmsrCostInput {
  shares: number[];
  b: number;
}

export interface LmsrTradeCostInput {
  shares: number[];
  deltaShares: number[];
  b: number;
}

export interface DynamicBConfig {
  baseB: number;
  minB: number;
  maxB: number;
  volumeScalingAlpha: number;
  depthThresholdUsd: number;
}

export interface DynamicBState {
  currentB: number;
  rollingVolumeUsd: number;
  poolDepthUsd: number;
  lastUpdatedMs: number;
}

export interface DynamicBAdaptationResult {
  previousB: number;
  newB: number;
  scaledShares: number[];
  maxSubsidyUsd: number;
}

// ============================================================================
// 2. CPMM Pricing Contracts (M1 / F3)
// ============================================================================

export type BinaryOutcomeToken = 'YES' | 'NO';

export interface CpmmReserves {
  yesShares: number;
  noShares: number;
  collateralReserve: number;
}

export interface CpmmSwapResult {
  inputToken: BinaryOutcomeToken;
  inputAmount: number;
  outputAmount: number;
  feeAmount: number;
  newReserves: CpmmReserves;
  effectivePrice: number;
  priceImpact: number;
  spotPriceYes: number;
  spotPriceNo: number;
}

export interface CpmmLiquidityResult {
  sharesAddedOrRemoved: number;
  yesSharesDelta: number;
  noSharesDelta: number;
  collateralDelta: number;
  newReserves: CpmmReserves;
}

// ============================================================================
// 3. Multi-Token Pool Contracts (M1 / F4)
// ============================================================================

export type PoolEngineType = 'LMSR' | 'CPMM';

export interface OutcomeTokenDefinition {
  id: string;
  name: string;
  symbol: string;
}

export interface MultiTokenPoolConfig {
  poolId: string;
  name: string;
  engineType: PoolEngineType;
  outcomes: OutcomeTokenDefinition[];
  initialB?: number;
  initialCollateral: number;
  feeBps: number;
}

export interface PoolTradeRequest {
  poolId: string;
  outcomeId: string;
  sharesDelta: number;
  maxCostUsd?: number;
  minSharesOut?: number;
}

export interface PoolTradeResult {
  poolId: string;
  outcomeId: string;
  sharesDelta: number;
  costUsd: number;
  feeUsd: number;
  netCostUsd: number;
  newSpotPrices: Record<string, number>;
  timestamp: number;
}

// ============================================================================
// 4. Combinatorial Mispricing & Basket Scanning (M2 / F5)
// ============================================================================

export type ArbitrageDirection = 'OVERPRICED_SELL_BASKET' | 'UNDERPRICED_BUY_BASKET';

export interface OutcomeMarketQuote {
  outcomeId: string;
  bestBid: number;
  bestAsk: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  spotPrice: number;
}

export interface MultiOutcomeMarket {
  marketId: string;
  title: string;
  outcomes: OutcomeMarketQuote[];
  collateralToken: string;
  feeBps: number;
}

export interface ArbitrageOpportunity {
  opportunityId: string;
  marketId: string;
  direction: ArbitrageDirection;
  sumPrices: number;
  hurdlePrice: number;
  grossSpread: number;
  outcomes: string[];
  legPrices: Record<string, number>;
  theoreticalMaxProfitUsd: number;
  timestamp: number;
}

// ============================================================================
// 5. Basket Pricer & Depth Walker (M2 / F6)
// ============================================================================

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OutcomeOrderBook {
  outcomeId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface BasketPricerConfig {
  feeBps: number;
  gasCostUsd: number;
  minProfitHurdleUsd: number;
  maxSlippageBps: number;
}

export interface BasketPricerResult {
  opportunityId: string;
  direction: ArbitrageDirection;
  executableSize: number;
  effectiveLegPrices: Record<string, number>;
  totalCapitalRequiredUsd: number;
  grossProfitUsd: number;
  feeUsd: number;
  gasCostUsd: number;
  netProfitUsd: number;
  roiBps: number;
  isProfitable: boolean;
}

// ============================================================================
// 6. Atomic Multi-Leg Execution & Unwind (M2 / F7-F8)
// ============================================================================

export type BundleExecutionStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'FILLED'
  | 'PARTIAL_UNWINDING'
  | 'UNWOUND'
  | 'FAILED';

export interface ExecutionLeg {
  legId: string;
  outcomeId: string;
  side: 'BUY' | 'SELL';
  targetSize: number;
  filledSize: number;
  limitPrice: number;
  avgFillPrice: number;
  status: 'PENDING' | 'FILLED' | 'PARTIAL' | 'FAILED';
  error?: string;
  latencyMs: number;
}

export interface BundleExecutionResult {
  bundleId: string;
  opportunityId: string;
  status: BundleExecutionStatus;
  legs: ExecutionLeg[];
  totalFilledSize: number;
  realizedPnlUsd: number;
  unwindResult?: UnwindResult;
  totalLatencyMs: number;
  executedAt: number;
}

export interface UnwindResult {
  unwoundLegs: {
    outcomeId: string;
    unwoundSize: number;
    unwindPrice: number;
    realizedLossUsd: number;
  }[];
  totalUnwoundNotionalUsd: number;
  netUnwindLossUsd: number;
  residualExposure: number;
  completedAt: number;
}

// ============================================================================
// 7. Liquidity Quoting & Delta Rebalancing (M3 / F9-F10)
// ============================================================================

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

export interface InventoryState {
  holdings: Record<string, number>; // outcomeId -> share count
  cashBalanceUsd: number;
  netPortfolioDelta: number;
}

export interface MarketState {
  marketId: string;
  spotPrices: Record<string, number>;
  volatility: number;
  timeToMaturitySec: number;
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

// ============================================================================
// 8. Adverse Selection & VPIN Defense (M3 / F11)
// ============================================================================

export interface ToxicityAssessment {
  vpin: number;
  toxicityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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

// ============================================================================
// 9. Pre-Trade Risk Gates & Breakers (M4 / F12)
// ============================================================================

export interface TradeIntent {
  intentId: string;
  marketId: string;
  poolId?: string;
  notionalUsd: number;
  expectedEdgeBps: number;
  venueLatencyMs: number;
}

export interface RiskContext {
  portfolioEquityUsd: number;
  peakDailyEquityUsd: number;
  currentDailyEquityUsd: number;
  currentPoolExposureUsd: number;
  openOrdersCount: number;
}

export interface RiskGateConfig {
  maxQuarterKellyRatio: number;
  maxPoolExposureUsd: number;
  maxDailyDrawdownThreshold: number;
  maxVenueLatencyMs: number;
}

export type RiskCheckVerdict = 'APPROVED' | 'REJECTED';

export type RiskRejectionCode =
  | 'KELLY_CAP_EXCEEDED'
  | 'MAX_POOL_EXPOSURE_EXCEEDED'
  | 'DAILY_DRAWDOWN_BREACH'
  | 'LATENCY_SPIKE_EXCEEDED';

export interface RiskCheckResult {
  verdict: RiskCheckVerdict;
  allowedNotionalUsd: number;
  rejectionCode?: RiskRejectionCode;
  reason?: string;
}

// ============================================================================
// 10. Telemetry & Hash-Chained Audit Logging (M4 / F13-F14)
// ============================================================================

export type AmmAuditAction =
  | 'POOL_INITIALIZED'
  | 'TRADE_EXECUTED'
  | 'BASKET_ARBITRAGE_DETECTED'
  | 'BUNDLE_SUBMITTED'
  | 'BUNDLE_FILLED'
  | 'PARTIAL_UNWIND_TRIGGERED'
  | 'PARTIAL_UNWIND_COMPLETED'
  | 'QUOTE_PUBLISHED'
  | 'DEFENSIVE_TRIPWIRE_TRIGGERED'
  | 'REBALANCE_DISPATCHED'
  | 'RISK_GATE_APPROVED'
  | 'RISK_GATE_REJECTED'
  | 'CIRCUIT_BREAKER_TRIPPED';

export interface AmmAuditRecord {
  index: number;
  timestamp: number;
  action: AmmAuditAction;
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  failedIndex?: number;
  reason?: string;
}

export interface AmmMetricsSnapshot {
  liquidityDepthUsd: number;
  tradeVolumeUsd: number;
  arbitragePnlUsd: number;
  vpinToxicity: number;
  circuitBreakerTripped: boolean;
  activePoolsCount: number;
}

// ============================================================================
// 11. Zod Schemas for Runtime Validation
// ============================================================================

export const LmsrCostInputSchema = z.object({
  shares: z.array(z.number()),
  b: z.number().positive('Liquidity parameter b must be > 0'),
});

export const CpmmReservesSchema = z.object({
  yesShares: z.number().positive(),
  noShares: z.number().positive(),
  collateralReserve: z.number().nonnegative(),
});

export const TradeIntentSchema = z.object({
  intentId: z.string().min(1),
  marketId: z.string().min(1),
  poolId: z.string().optional(),
  notionalUsd: z.number().positive(),
  expectedEdgeBps: z.number(),
  venueLatencyMs: z.number().nonnegative(),
});
