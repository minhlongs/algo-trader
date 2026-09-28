/**
 * Test Harness Data Contracts & Types
 * Cross-Engine Unified Trading Loop & Execution Bridge
 */

import type { EngineId } from '../../../../src/desk/portfolio/types';
import type { VenueId } from '../../../../src/desk/sor/sor-types';
import type {
  UnifiedTradeIntent,
  IntentUrgency,
  IntentOrderType,
  SyntheticFill,
  ResolutionResult,
  QueueStatus,
  IntentPriority,
} from '../../../../src/desk/orchestrator/orchestrator-types';

export type {
  EngineId,
  VenueId,
  UnifiedTradeIntent,
  IntentUrgency,
  IntentOrderType,
  SyntheticFill,
  ResolutionResult,
  QueueStatus,
  IntentPriority,
};

export type TriMode = 'PAPER' | 'SHADOW' | 'LIVE';

export type AutonomousLifecycleState =
  | 'INITIALIZING'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'EMERGENCY_HALT';

export type CircuitBreakerTier = 'NORMAL' | 'ALERT' | 'REDUCE' | 'HALT' | 'HARD_STOP';

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

export interface DispatchResult {
  readonly orderId: string;
  readonly intentId: string;
  readonly mode: TriMode;
  readonly venue: string;
  readonly status: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED' | 'CANCELLED';
  readonly executedQuantity: number;
  readonly averagePrice: number;
  readonly feeUsd: number;
  readonly slippageBps: number;
  readonly latencyMs: number;
}

export interface OrderSlice {
  readonly sliceIndex: number;
  readonly totalSlices: number;
  readonly quantity: number;
  readonly targetPrice?: number;
  readonly executedQuantity: number;
  readonly averagePrice: number;
  readonly feeUsd: number;
  readonly status: 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED';
}

export interface TelemetryLifecycleEvent {
  readonly eventId: string;
  readonly eventType:
    | 'SUBMITTED'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELLED'
    | 'REJECTED'
    | 'CIRCUIT_BREAKER_TRIGGERED'
    | 'EMERGENCY_HALT';
  readonly orderId: string;
  readonly intentId: string;
  readonly engineId: EngineId;
  readonly venue: VenueId;
  readonly mode: TriMode;
  readonly quantity: number;
  readonly price?: number;
  readonly timestamp: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MockOrderBookLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface MockVenueBook {
  readonly venueId: VenueId;
  readonly symbol: string;
  readonly bids: readonly MockOrderBookLevel[];
  readonly asks: readonly MockOrderBookLevel[];
  readonly takerFeeBps: number;
  readonly makerFeeBps: number;
  readonly gasCostUsd: number;
  readonly timestamp: number;
}
