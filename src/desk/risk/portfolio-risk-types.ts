import * as z from 'zod';
import { EngineIdSchema, type EngineId } from '../portfolio/types';

export { EngineIdSchema, type EngineId };

export const CircuitBreakerTierSchema = z.enum([
  'NORMAL',
  'ALERT',
  'REDUCE',
  'HALT',
  'HARD_STOP',
]);
export type CircuitBreakerTier = z.infer<typeof CircuitBreakerTierSchema>;

export const CircuitBreakerStateSchema = z.object({
  tier: CircuitBreakerTierSchema,
  peakToTroughDrawdown: z.number().min(0).max(1),
  meanCorrelation: z.number().min(-1).max(1),
  grossLeverage: z.number().nonnegative(),
  triggeredAt: z.number().int().nonnegative(),
  reason: z.string(),
});
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

export interface EngineRiskAdapter {
  readonly engineId: EngineId;
  notifyCircuitBreaker(state: CircuitBreakerState): Promise<void>;
  reducePositions(reductionFactor: number): Promise<void>;
  haltTrading(): Promise<void>;
  emergencyHardStop(): Promise<void>;
}

export const PositionRiskSchema = z.object({
  symbol: z.string(),
  engineId: EngineIdSchema,
  venue: z.string(),
  notionalUsd: z.number(),
  currentPrice: z.number().positive(),
  quantity: z.number(),
  side: z.enum(['BUY', 'SELL', 'LONG', 'SHORT']),
  delta: z.number().default(1.0),
  unrealizedPnlUsd: z.number().default(0),
  timestamp: z.number().int().nonnegative().default(() => Date.now()),
});
export type PositionRisk = z.infer<typeof PositionRiskSchema>;

export const VaRReportSchema = z.object({
  parametricVaR: z.number().nonnegative(),
  historicalVaR: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  horizonDays: z.number().positive(),
  portfolioNav: z.number().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  calculationMethod: z.enum(['parametric', 'historical', 'both']).default('both'),
});
export type VaRReport = z.infer<typeof VaRReportSchema>;

export const CVaRReportSchema = z.object({
  parametricCVaR: z.number().nonnegative(),
  historicalCVaR: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  horizonDays: z.number().positive(),
  portfolioNav: z.number().nonnegative(),
  timestamp: z.number().int().nonnegative(),
});
export type CVaRReport = z.infer<typeof CVaRReportSchema>;

export interface VarCvarResult {
  readonly parametricVaR: number;
  readonly parametricCVaR: number;
  readonly historicalVaR: number;
  readonly historicalCVaR: number;
  readonly confidence: number;
  readonly horizonDays: number;
  readonly portfolioNav: number;
}

export const TailDivergenceResultSchema = z.object({
  ratio: z.number().nonnegative(),
  isTailDivergent: z.boolean(),
  parametricCVaR: z.number().nonnegative(),
  historicalCVaR: z.number().nonnegative(),
  threshold: z.number().positive().default(1.5),
  warningMessage: z.string().optional(),
});
export type TailDivergenceResult = z.infer<typeof TailDivergenceResultSchema>;

export const GrossLeverageReportSchema = z.object({
  totalGrossExposureUsd: z.number().nonnegative(),
  totalNavUsd: z.number().nonnegative(),
  grossLeverage: z.number().nonnegative(),
  maxAllowedLeverage: z.number().positive().default(3.0),
  isAllowed: z.boolean(),
  netDirectionalExposureUsd: z.number(),
  netLeverage: z.number().nonnegative(),
  maxNetLeverage: z.number().positive().default(1.0),
  violationReason: z.string().optional(),
});
export type GrossLeverageReport = z.infer<typeof GrossLeverageReportSchema>;

export interface LeverageCheckResult {
  readonly grossLeverage: number;
  readonly netExposure: number;
  readonly isAllowed: boolean;
  readonly maxAllowedLeverage: number;
  readonly violationReason?: string;
}

export const VenueExposureReportSchema = z.object({
  venueAllocations: z.record(z.string(), z.number()),
  venueCaps: z.record(z.string(), z.number()),
  venueRatios: z.record(z.string(), z.number()),
  isCompliant: z.boolean(),
  violations: z.array(z.string()),
});
export type VenueExposureReport = z.infer<typeof VenueExposureReportSchema>;

export const DEFAULT_VENUE_CAPS: Readonly<Record<string, number>> = {
  binance: 0.50,
  bybit: 0.50,
  polymarket_clob: 0.40,
  polymarket_amm: 0.30,
  polymarket: 0.40,
} as const;
