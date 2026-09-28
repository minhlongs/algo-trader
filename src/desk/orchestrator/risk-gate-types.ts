/**
 * Synchronized Risk Gate Types (Milestone 2 - R2)
 */

import type { PortfolioAllocator } from '../portfolio/portfolio-allocator';
import type { GlobalCircuitBreaker } from '../risk/global-circuit-breaker';
import type { CircuitBreakerTier } from '../risk/portfolio-risk-types';
import type { LeverageExposureGuard } from '../risk/leverage-exposure-guard';
import type { LiveExecutionGuard } from '../execution/live-execution-guard';
import type { EngineId } from './orchestrator-types';

export type { CircuitBreakerTier };

export interface RiskGateVerdict {
  readonly approved: boolean;
  readonly reason?: string;
  readonly scaledQuantity: number;
  readonly originalQuantity: number;
  readonly allocatedCapitalUsd: number;
  readonly currentNavUsd: number;
  readonly cashBufferRatio: number;
  readonly grossLeverage: number;
  readonly circuitBreakerTier: CircuitBreakerTier;
}

export interface SynchronizedRiskGateOptions {
  readonly totalNavUsd?: number;
  readonly liquidCashUsd?: number;
  readonly minCashBufferRatio?: number;
  readonly maxGrossLeverage?: number;
  readonly maxSingleVenueConcentration?: number;
  readonly initialBudgets?: Partial<Record<EngineId, number>>;
  readonly allocator?: PortfolioAllocator;
  readonly circuitBreaker?: GlobalCircuitBreaker;
  readonly leverageGuard?: LeverageExposureGuard;
  readonly liveGuard?: LiveExecutionGuard;
}
