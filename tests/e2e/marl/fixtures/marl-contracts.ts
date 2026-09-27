/**
 * Canonical TypeScript contracts, types, and Zod schemas for
 * MARL Market-Making & Delta-Neutral Liquidity Engine.
 *
 * Source: PROJECT.md & spec_miner_survey_1/handoff.md
 */

import { z } from 'zod';

// ============================================================================
// 1. Avellaneda-Stoikov & Quoting (M1 / F1-F3)
// ============================================================================

export const AvellanedaStoikovConfigSchema = z.object({
  gamma: z.number().positive('Risk aversion gamma must be > 0').default(0.1),
  kappa: z.number().positive('Orderbook intensity kappa must be > 0').default(1.5),
  sigma: z.number().nonnegative('Volatility sigma must be >= 0').default(0.02),
  terminalHorizonSec: z.number().positive('Terminal horizon must be > 0').default(86_400),
  tickSize: z.number().positive('Tick size must be > 0').default(0.01),
  minSpread: z.number().nonnegative('Min spread must be >= 0').default(0.02),
  maxSpread: z.number().positive('Max spread must be > 0').default(0.20),
  maxInventory: z.number().positive('Max inventory must be > 0').default(10_000),
  quoteSize: z.number().positive('Quote size must be > 0').default(100),
});

export type AvellanedaStoikovConfig = z.infer<typeof AvellanedaStoikovConfigSchema>;

export interface ReservationPriceInput {
  midPrice: number;
  inventory: number;
  gamma: number;
  sigma: number;
  timeToHorizonSec: number;
}

export interface OptimalQuotesInput extends ReservationPriceInput {
  kappa: number;
  tickSize?: number;
  minSpread?: number;
  maxSpread?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface OptimalQuotesResult {
  reservationPrice: number;
  bidPrice: number;
  askPrice: number;
  bidSpread: number;
  askSpread: number;
  totalSpread: number;
  rawBidPrice?: number;
  rawAskPrice?: number;
  clamped: boolean;
}

// ============================================================================
// 2. POMDP Environment & Market Feeds (M1 / F4-F6)
// ============================================================================

export type QuotingMode = 'BOTH' | 'BID_ONLY' | 'ASK_ONLY' | 'CANCEL_ALL';

export const MarlActionSchema = z.object({
  bidSpreadMultiplier: z.number().min(0.5).max(5.0),
  askSpreadMultiplier: z.number().min(0.5).max(5.0),
  bidSizeRatio: z.number().min(0.0).max(1.0),
  askSizeRatio: z.number().min(0.0).max(1.0),
  mode: z.enum(['BOTH', 'BID_ONLY', 'ASK_ONLY', 'CANCEL_ALL']),
});

export type MarlAction = z.infer<typeof MarlActionSchema>;

export interface MarlObservationVector {
  readonly values: Float64Array; // Length 24, strictly normalized to [-1, 1] or [0, 1]
  readonly timestamp: number;
}

export interface MarlStepInfo {
  realizedPnl: number;
  unrealizedPnl: number;
  inventory: number;
  netDelta: number;
  vpin: number;
  kylesLambda: number;
  quotesPosted: number;
  fillsCount: number;
}

export interface MarlStepResult {
  observation: MarlObservationVector;
  reward: number;
  done: boolean;
  truncated: boolean;
  info: MarlStepInfo;
}

export interface MarlOrderBookLevel {
  price: number;
  size: number;
  orderCount?: number;
}

export interface MarlOrderBook {
  symbol: string;
  venue: string;
  bids: MarlOrderBookLevel[];
  asks: MarlOrderBookLevel[];
  timestamp: number;
  sequence?: number;
}

export interface QuoteProposal {
  agentId: string;
  symbol: string;
  venue: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  reservationPrice: number;
  bidSpread: number;
  askSpread: number;
  confidence: number;
  skewFactor?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentObservation {
  symbol: string;
  venue: string;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  orderBookImbalance: number;
  depthImbalance: number;
  inventory: number;
  timeToHorizonSec: number;
  volatility: number;
  netDelta: number;
  observationVector?: Float64Array | number[];
  timestamp: number;
}

export interface ReplayFillEvent {
  orderId: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  maker: boolean;
  spreadBps: number;
}

export interface ReplayStepResult {
  step: number;
  orderBook: MarlOrderBook;
  fills: ReplayFillEvent[];
  midPrice: number;
  done: boolean;
}

export interface LiveStreamAdapterConfig {
  symbol: string;
  venue?: string;
  heartbeatTimeoutMs?: number;
  autoReconnect?: boolean;
}

// ============================================================================
// 3. Cross-Venue Delta Hedging & Compensatory Unwinds (M2 / F7-F10)
// ============================================================================

export type VenueId = 'polymarket' | 'binance' | 'bybit' | 'kucoin';

export const DeltaHedgeConfigSchema = z.object({
  deltaThreshold: z.number().positive().default(0.10),
  hysteresisRatio: z.number().min(0.1).max(0.9).default(0.5),
  primaryHedgeVenue: z.enum(['binance', 'bybit']).default('binance'),
  fallbackHedgeVenue: z.enum(['binance', 'bybit']).default('bybit'),
  maxHedgeSlippageBps: z.number().nonnegative().default(15),
  orderTimeoutMs: z.number().int().positive().default(300),
  maxUnwindRetries: z.number().int().nonnegative().default(3),
  emergencyLiquidation: z.boolean().default(true),
  minLotSize: z.number().positive().default(0.001),
});

export type DeltaHedgeConfig = z.infer<typeof DeltaHedgeConfigSchema>;

export interface VenuePositionDelta {
  venue: VenueId;
  symbol: string;
  contracts: number;
  unitDelta: number;
  netDelta: number;
  notionalUsd: number;
}

export interface PortfolioDeltaSnapshot {
  netDelta: number;
  grossNotionalUsd: number;
  polyDelta: number;
  cexDelta: number;
  positions: VenuePositionDelta[];
  timestamp: number;
  toleranceThreshold: number;
  rebalanceRequired: boolean;
}

export interface HedgeOrderRequest {
  venue: VenueId;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  type: 'market' | 'limit';
  price?: number;
  maxSlippageBps: number;
}

export interface HedgeExecutionReport {
  hedgeId: string;
  venue: VenueId;
  symbol: string;
  side: 'buy' | 'sell';
  requestedAmount: number;
  filledAmount: number;
  avgFillPrice: number;
  latencyMs: number;
  status: 'FILLED' | 'PARTIAL' | 'FAILED' | 'UNWOUND';
  residualDelta: number;
}

export interface CompensatoryUnwindResult {
  unwindSuccess: boolean;
  residualDelta: number;
  filledAmount: number;
  unwoundAmount: number;
  retryCount: number;
  actionTaken: 'secondary_cex_filled' | 'poly_liquidated' | 'emergency_market' | 'none';
}

// ============================================================================
// 4. Adverse Selection & Microstructure Defense (M3 / F11-F15)
// ============================================================================

export const AdverseSelectionConfigSchema = z.object({
  bucketVolumeUsd: z.number().positive().default(10_000),
  vpinWindowBuckets: z.number().int().positive().default(50),
  vpinWarningCdf: z.number().min(0.5).max(1.0).default(0.75),
  vpinTripwireCdf: z.number().min(0.8).max(1.0).default(0.95),
  kylesLambdaWindowTicks: z.number().int().positive().default(100),
  kylesLambdaBaseline: z.number().positive().default(0.0001),
  kylesLambdaMultiplierTripwire: z.number().positive().default(3.0),
  maxSpreadWideningMultiplier: z.number().positive().default(5.0),
  cooldownWindowMs: z.number().int().positive().default(15_000),
  bucketTimeoutMs: z.number().int().positive().default(300_000),
  sweepLevelThreshold: z.number().int().positive().default(3),
  sweepWindowMs: z.number().int().positive().default(100),
});

export type AdverseSelectionConfig = z.infer<typeof AdverseSelectionConfigSchema>;

export interface TradeTick {
  tradeId: string;
  timestamp: number;
  price: number;
  volume: number;
  bidPrice: number;
  askPrice: number;
}

export interface VolumeBucket {
  bucketIndex: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  isComplete: boolean;
  completedAt?: number;
}

export interface ToxicityMetricsSnapshot {
  vpin: number;
  vpinCdf: number;
  vpinZscore: number;
  kylesLambda: number;
  kylesLambdaTStat: number;
  lambdaRatio: number;
  sweepDetected: boolean;
  wideningMultiplier: number;
  isTripwireActive: boolean;
  activeReason?: string;
  timestamp: number;
}

export interface SweepDetectionResult {
  sweepDetected: boolean;
  direction?: 'buy' | 'sell';
  levelsDepleted: number;
  volumeSwept: number;
  timeElapsedMs: number;
  fastJumpAnomaly: boolean;
}

// ============================================================================
// 5. Pre-Trade Risk Gates, Telemetry & Audit Logging (M4 / F16-F19)
// ============================================================================

export const MarlRiskConfigSchema = z.object({
  maxPositionFraction: z.number().min(0.01).max(0.20).default(0.05), // Quarter-Kelly limit (5%)
  maxInventoryNotionalUsd: z.number().positive().default(50_000),
  maxDailyDrawdownFraction: z.number().min(0.05).max(0.50).default(0.15), // 15% breaker
  maxVenueLatencyMs: z.number().positive().default(500),
  emergencyHaltEnabled: z.boolean().default(true),
});

export type MarlRiskConfig = z.infer<typeof MarlRiskConfigSchema>;

export interface MarlRiskEvaluationResult {
  approved: boolean;
  rejectionReason?: string;
  quarterKellySizeUsd: number;
  currentDrawdownFraction: number;
  venueLatencyMs: number;
  circuitBroken: boolean;
}

export interface MarlTelemetryRecorders {
  recordQuote(action: 'posted' | 'canceled' | 'rejected', side: 'bid' | 'ask' | 'both'): void;
  recordFill(side: 'bid' | 'ask', size: number, fillPrice: number, spreadBps: number): void;
  recordInventorySkew(inventory: number, notionalUsd: number): void;
  recordNetDelta(netDelta: number, polyDelta: number, cexDelta: number): void;
  recordPnl(realizedUsd: number, unrealizedUsd: number): void;
  recordToxicity(vpin: number, kylesLambda: number, tripwireTripped: boolean): void;
  recordHedgeLatency(venue: string, latencyMs: number, status: string): void;
}

export type MarlAuditAction =
  | 'marl.quote.posted'
  | 'marl.quote.canceled'
  | 'marl.fill.received'
  | 'marl.hedge.submitted'
  | 'marl.hedge.filled'
  | 'marl.hedge.unwound'
  | 'marl.toxicity.widened'
  | 'marl.tripwire.activated'
  | 'marl.risk.rejected';

export const MarlAuditPayloadSchema = z.object({
  action: z.enum([
    'marl.quote.posted',
    'marl.quote.canceled',
    'marl.fill.received',
    'marl.hedge.submitted',
    'marl.hedge.filled',
    'marl.hedge.unwound',
    'marl.toxicity.widened',
    'marl.tripwire.activated',
    'marl.risk.rejected',
  ]),
  actor: z.string().default('algo-trader:marl-engine'),
  sequenceNumber: z.number().int().nonnegative(),
  timestamp: z.number().int().positive(),
  details: z.record(z.string(), z.unknown()),
  previousHash: z.string().regex(/^[0-9a-f]{64}$/i),
  hash: z.string().regex(/^[0-9a-f]{64}$/i),
});

export type MarlAuditPayload = z.infer<typeof MarlAuditPayloadSchema>;

export interface MarlAuditRecord {
  sequenceNumber: number;
  timestamp: number;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export interface UnifiedMarlEngineConfig {
  symbol: string;
  asConfig: AvellanedaStoikovConfig;
  deltaHedgeConfig: DeltaHedgeConfig;
  adverseSelectionConfig: AdverseSelectionConfig;
  riskConfig: MarlRiskConfig;
  auditSecret?: string;
}
