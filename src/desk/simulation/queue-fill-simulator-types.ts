/**
 * Queue Position and Fill Simulator Contracts
 * Defines latency jitter and fill probability configurations.
 *
 * @module desk/simulation/queue-fill-simulator-types
 */

export interface LatencyJitterConfig {
  readonly meanLatencyMs: number;
  readonly stdDevLatencyMs: number;
  readonly cancellationRatePerSec?: number;
}

export interface QueueFillEstimate {
  readonly queuePositionAhead: number;
  readonly estimatedWaitTimeMs: number;
  readonly fillProbability: number;
  readonly simulatedTransitLatencyMs: number;
  readonly isLikelyFilled: boolean;
}

export interface PassiveOrderContext {
  readonly orderId: string;
  readonly price: number;
  readonly size: number;
  readonly volumeAhead: number;
  readonly historicalTradeRatePerSec: number;
  readonly timestampMs: number;
}
