import * as z from 'zod';

export const EngineIdSchema = z.enum(['arbitrage', 'marl', 'amm', 'alpha-lab']);
export type EngineId = z.infer<typeof EngineIdSchema>;

export const ENGINE_IDS: readonly EngineId[] = ['arbitrage', 'marl', 'amm', 'alpha-lab'] as const;

export const MarketRegimeSchema = z.enum([
  'TRENDING',
  'RANGING',
  'HIGH_VOLATILITY',
  'LOW_LIQUIDITY',
]);
export type MarketRegime = z.infer<typeof MarketRegimeSchema>;

export const StrategyPerformanceSchema = z.object({
  engineId: EngineIdSchema,
  rollingSharpe: z.number(),
  rollingSortino: z.number(),
  rollingVolatility: z.number().nonnegative(),
  totalPnlUsd: z.number(),
});
export type StrategyPerformance = z.infer<typeof StrategyPerformanceSchema>;

export const RiskBudgetSchema = z.object({
  targetRiskBudgets: z.record(EngineIdSchema, z.number().min(0).max(1)),
  lockedCapital: z.record(EngineIdSchema, z.number().min(0)),
});
export type RiskBudget = z.infer<typeof RiskBudgetSchema>;

export const CovarianceMatrixSchema = z.object({
  engines: z.array(EngineIdSchema),
  matrix: z.array(z.array(z.number())),
  observations: z.number().int().nonnegative(),
  lastUpdated: z.number().int().nonnegative(),
  isConditioned: z.boolean(),
});
export type CovarianceMatrix = z.infer<typeof CovarianceMatrixSchema>;

export const PortfolioAllocationSchema = z.object({
  weights: z.record(EngineIdSchema, z.number().min(0).max(1)),
  allocatedCapitalUsd: z.record(EngineIdSchema, z.number().min(0)),
  unallocatedCashUsd: z.number().min(0),
  cashBufferRatio: z.number().min(0).max(1),
  riskContributions: z.record(EngineIdSchema, z.number().min(0).max(1)),
  maxRiskDiscrepancy: z.number().min(0),
  timestamp: z.number().int().nonnegative(),
});
export type PortfolioAllocation = z.infer<typeof PortfolioAllocationSchema>;

export const AllocationConfigSchema = z.object({
  minCashBufferRatio: z.number().min(0.20).max(0.50).default(0.20),
  rebalanceDeadband: z.number().min(0.01).max(0.10).default(0.03),
  cooldownPeriodMs: z.number().int().min(0).default(15 * 60 * 1000),
  convergenceTolerance: z.number().positive().max(1e-3).default(1e-4),
  maxIterations: z.number().int().min(10).max(100).default(25),
  minRiskBudget: z.number().min(0.01).max(0.20).default(0.05),
  maxRiskBudget: z.number().min(0.30).max(0.80).default(0.50),
  gammaTilt: z.number().min(0.1).max(1.0).default(0.35),
  ridgeEpsilon: z.number().positive().max(1e-3).default(1e-7),
  riskFreeRate: z.number().min(0).default(0.04),
  coldStartWindow: z.number().int().min(5).default(20),
});
export type AllocationConfig = z.infer<typeof AllocationConfigSchema>;

export const AllocationContextSchema = z.object({
  totalNavUsd: z.number().positive(),
  currentAllocations: z.record(EngineIdSchema, z.number().min(0)),
  lockedCapital: z.record(EngineIdSchema, z.number().min(0)),
  regime: MarketRegimeSchema,
  performance: z.record(EngineIdSchema, StrategyPerformanceSchema),
  timestamp: z.number().int().nonnegative().optional(),
});
export type AllocationContext = z.infer<typeof AllocationContextSchema>;

export interface GuardAllocationResult {
  readonly allocatedCapitalUsd: Readonly<Record<EngineId, number>>;
  readonly unallocatedCashUsd: number;
  readonly cashBufferRatio: number;
  readonly isStarvationProtected: boolean;
  readonly drainModeEngines: readonly EngineId[];
}

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

