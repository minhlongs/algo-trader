/**
 * Microsecond Fast Circuit Breaker
 * Manages tiered kill-switch levels (L0-L4) based on error rates and latency spikes.
 *
 * @module desk/edge/microsecond-circuit-breaker
 */

import { CircuitBreakerState, KillSwitchLevel } from './edge-hft-types';

export interface CircuitBreakerConfig {
  readonly errorWindowSize?: number;
  readonly l1RejectionPctThreshold?: number;
  readonly l2RejectionPctThreshold?: number;
  readonly l3LatencyP99ThresholdMs?: number;
  readonly l4ConsecutiveErrorsThreshold?: number;
}

export class MicrosecondCircuitBreaker {
  private readonly config: Required<CircuitBreakerConfig>;
  private errorWindow: boolean[] = [];
  private latencies: number[] = [];
  private consecutiveErrors = 0;
  private currentLevel: KillSwitchLevel = 'L0_NORMAL';
  private lastTripTimestampMs?: number;

  public constructor(config?: CircuitBreakerConfig) {
    this.config = {
      errorWindowSize: config?.errorWindowSize ?? 100,
      l1RejectionPctThreshold: config?.l1RejectionPctThreshold ?? 10,
      l2RejectionPctThreshold: config?.l2RejectionPctThreshold ?? 25,
      l3LatencyP99ThresholdMs: config?.l3LatencyP99ThresholdMs ?? 200,
      l4ConsecutiveErrorsThreshold: config?.l4ConsecutiveErrorsThreshold ?? 10,
    };
  }

  public recordExecution(isSuccess: boolean, latencyMs: number, timestampMs: number): CircuitBreakerState {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.config.errorWindowSize) {
      this.latencies.shift();
    }

    this.errorWindow.push(!isSuccess);
    if (this.errorWindow.length > this.config.errorWindowSize) {
      this.errorWindow.shift();
    }

    if (!isSuccess) {
      this.consecutiveErrors += 1;
    } else {
      this.consecutiveErrors = 0;
    }

    this.evaluateState(timestampMs);
    return this.getState();
  }

  public getState(): CircuitBreakerState {
    const errorCount = this.errorWindow.filter(Boolean).length;
    const total = Math.max(1, this.errorWindow.length);
    const rejectionRatePct = Math.round((errorCount / total) * 100);

    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p99Idx = Math.floor(sortedLatencies.length * 0.99);
    const latencyP99Ms = sortedLatencies[p99Idx] ?? 0;

    return {
      level: this.currentLevel,
      isTriggered: this.currentLevel !== 'L0_NORMAL',
      rejectionRatePct,
      consecutiveErrors: this.consecutiveErrors,
      latencyP99Ms,
      lastTripTimestampMs: this.lastTripTimestampMs,
    };
  }

  public manualReset(): void {
    this.currentLevel = 'L0_NORMAL';
    this.consecutiveErrors = 0;
    this.errorWindow = [];
    this.latencies = [];
  }

  private evaluateState(timestampMs: number): void {
    const state = this.getState();

    if (this.consecutiveErrors >= this.config.l4ConsecutiveErrorsThreshold) {
      this.setLevel('L4_FULL_SHUTDOWN', timestampMs);
    } else if (state.latencyP99Ms >= this.config.l3LatencyP99ThresholdMs) {
      this.setLevel('L3_DISCONNECT', timestampMs);
    } else if (state.rejectionRatePct >= this.config.l2RejectionPctThreshold) {
      this.setLevel('L2_CANCEL_ONLY', timestampMs);
    } else if (state.rejectionRatePct >= this.config.l1RejectionPctThreshold) {
      this.setLevel('L1_RATE_THROTTLE', timestampMs);
    } else {
      this.currentLevel = 'L0_NORMAL';
    }
  }

  private setLevel(newLevel: KillSwitchLevel, timestampMs: number): void {
    if (this.currentLevel !== newLevel) {
      this.currentLevel = newLevel;
      this.lastTripTimestampMs = timestampMs;
    }
  }
}
