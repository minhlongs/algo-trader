/**
 * Live Execution Guard Core Implementation
 */

import type { LivePositionTracker } from './live-position-tracker';
import type { PolymarketOrder } from './polymarket-signer';
import { setCircuitBreakerState } from '../../platform/middleware/prometheus-metrics';
import { logger } from '../../shared/utils/logger';
import {
  DEFAULT_CONFIG,
  type GuardConfig,
  type GuardResult,
  type GuardStatus,
} from './live-execution-guard-types';
import { evaluateGuardOrder } from './live-execution-guard-evaluator';

export class LiveExecutionGuard {
  private config: GuardConfig;
  private consecutiveLosses = 0;
  private totalLosses = 0;
  private totalWins = 0;
  private circuitTripped = false;
  private dailyPnl = 0;
  private positionTracker: LivePositionTracker | null = null;

  constructor(config: Partial<GuardConfig> & { capitalUsdc: number }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.capitalUsdc <= 0) {
      throw new Error('capitalUsdc must be positive');
    }
  }

  /** Attach position tracker for concurrent position checks */
  attachTracker(tracker: LivePositionTracker): void {
    this.positionTracker = tracker;
  }

  /**
   * Check whether an order should be allowed.
   * Returns { approved: false, reason } on first failing check.
   */
  guardOrder(order: PolymarketOrder): GuardResult {
    return evaluateGuardOrder(order, this.config, this.circuitTripped, this.dailyPnl, this.positionTracker);
  }

  recordWin(pnl: number): void {
    this.consecutiveLosses = 0;
    this.totalWins++;
    this.dailyPnl += pnl;
  }

  recordLoss(pnl: number): void {
    this.consecutiveLosses++;
    this.totalLosses++;
    this.dailyPnl += pnl;

    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.circuitTripped = true;
      setCircuitBreakerState(true);
      logger.error(
        `Circuit breaker tripped after ${this.consecutiveLosses} consecutive losses`,
        'LiveExecutionGuard',
        { dailyPnl: this.dailyPnl.toFixed(2), totalLosses: this.totalLosses },
      );
    }
  }

  resetCircuit(): void {
    this.circuitTripped = false;
    setCircuitBreakerState(false);
    this.consecutiveLosses = 0;
    logger.info('Circuit breaker reset', 'LiveExecutionGuard');
  }

  resetDaily(): void {
    this.dailyPnl = 0;
  }

  /** Hydrate persisted risk state on startup */
  hydrateState(snapshot: {
    dailyPnl?: number;
    totalWins?: number;
    totalLosses?: number;
    consecutiveLosses?: number;
    circuitTripped?: boolean;
  }): void {
    this.dailyPnl = snapshot.dailyPnl ?? this.dailyPnl;
    this.totalWins = snapshot.totalWins ?? this.totalWins;
    this.totalLosses = snapshot.totalLosses ?? this.totalLosses;
    this.consecutiveLosses = snapshot.consecutiveLosses ?? this.consecutiveLosses;
    const shouldTrip = Boolean(snapshot.circuitTripped) || this.consecutiveLosses >= this.config.maxConsecutiveLosses;
    this.circuitTripped = shouldTrip;
    setCircuitBreakerState(shouldTrip);
  }

  getStatus(): GuardStatus {
    return {
      enabled: this.config.enabled,
      consecutiveLosses: this.consecutiveLosses,
      totalLosses: this.totalLosses,
      totalWins: this.totalWins,
      circuitTripped: this.circuitTripped,
      dailyPnl: this.dailyPnl,
      openPositions: this.positionTracker?.getPositions().length ?? 0,
    };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`Guard ${enabled ? 'ENABLED' : 'DISABLED'}`, 'LiveExecutionGuard');
  }

  getConfig(): Readonly<GuardConfig> {
    return this.config;
  }
}
