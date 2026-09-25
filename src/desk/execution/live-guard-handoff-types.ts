import { LiveExecutionGuard } from './live-execution-guard-core';
import type { GuardStatus } from './live-execution-guard-types';
import type { LivePositionTracker } from './live-position-tracker';
import type { PolymarketOrder } from './polymarket-signer';
import type { TieredDrawdownBreaker } from '../risk/tiered-drawdown-breaker';
import type { AISignal } from '../strategies/ai-signal-adapter';
import type { TradeSignal } from '../polymarket/strategy-live-bridge-types';
import type { AlphaLifecycleState } from '../../alpha-lab/attribution/alpha-lifecycle-state-machine';

export type { AlphaLifecycleState };

export interface LiveGuardHandoffConfig {
  guard?: LiveExecutionGuard;
  capitalUsdc: number;
  maxPositionFraction?: number;     // default: 0.02 (2%)
  maxDailyDrawdown?: number;        // default: 0.05 (5%)
  maxConcurrentPositions?: number;  // default: 5 (Alpha-Lab specification)
  maxConsecutiveLosses?: number;    // default: 3
  signalTtlMs?: number;             // default: 200 ms
  rateLimitOrdersPerSec?: number;   // default: 5
  rateLimitBurst?: number;          // default: 10
  drawdownBreaker?: TieredDrawdownBreaker;
  positionTracker?: LivePositionTracker;
}

export interface LiveOrderHandoffRequest {
  strategyId: string;
  lifecycleState: AlphaLifecycleState;
  signal: TradeSignal | AISignal;
  order: PolymarketOrder;
}

export interface LiveRiskGateChecks {
  promotionEligible: boolean;
  signalTtlOk: boolean;
  rateLimitOk: boolean;
  drawdownBreakerOk: boolean;
  circuitBreakerOk: boolean;
  positionSizeOk: boolean;
  dailyDrawdownOk: boolean;
  concurrentLimitOk: boolean;
}

export interface LiveOrderHandoffVerdict {
  approved: boolean;
  reason?: string;
  checks: LiveRiskGateChecks;
  order?: PolymarketOrder;
  evaluatedAt: number;
}

export interface LiveHandoffStatus {
  guardStatus: GuardStatus;
  capitalUsdc: number;
  drawdownTier?: string;
  canOpenNewTrades: boolean;
  openPositionsCount: number;
  activeStrategyRateLimitersCount: number;
}
