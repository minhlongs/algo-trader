/**
 * Edge HFT Gateway & Multiplexer Contracts
 *
 * @module desk/edge/edge-hft-types
 */

export type EdgeRegion = 'tokyo' | 'frankfurt' | 'virginia' | 'singapore' | 'london';

export interface RegionLatencyMetric {
  readonly region: EdgeRegion;
  readonly rttMs: number;
  readonly packetLossPct: number;
  readonly lastUpdatedMs: number;
}

export interface RoutingDecision {
  readonly selectedRegion: EdgeRegion;
  readonly estimatedRttMs: number;
  readonly fallbackRegion?: EdgeRegion;
  readonly reason: string;
}

export interface StreamMessage {
  readonly venue: string;
  readonly streamId: string;
  readonly sequenceNumber: number;
  readonly payload: string;
  readonly arrivalTimestampNs: bigint;
}

export interface MultiplexerStats {
  readonly totalMessagesProcessed: number;
  readonly sequenceGapsDetected: number;
  readonly bufferUtilizationPct: number;
  readonly activeStreamsCount: number;
}

export type KillSwitchLevel = 'L0_NORMAL' | 'L1_RATE_THROTTLE' | 'L2_CANCEL_ONLY' | 'L3_DISCONNECT' | 'L4_FULL_SHUTDOWN';

export interface CircuitBreakerState {
  readonly level: KillSwitchLevel;
  readonly isTriggered: boolean;
  readonly rejectionRatePct: number;
  readonly consecutiveErrors: number;
  readonly latencyP99Ms: number;
  readonly lastTripTimestampMs?: number;
}
