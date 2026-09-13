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
  type GuardChecks,
  type GuardResult,
  type GuardStatus,
} from './live-execution-guard-types';
import {
  evaluateCircuitBreakerCheck,
  evaluatePositionSizeCheck,
  evaluateDailyDrawdownCheck,
  evaluateConcurrentPositionsCheck,
} from './live-execution-guard-evaluator';

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
    const checks: GuardChecks = {
      positionSizeOk: true,
      dailyDrawdownOk: true,
      concurrentLimitOk: true,
      circuitBreakerOk: true,
    };

    if (!this.config.enabled) {
      return { approved: true, checks };
    }

    // 1. Circuit breaker — check FIRST (catastrophic stop)
    const cbCheck = evaluateCircuitBreakerCheck(this.circuitTripped, this.config.maxConsecutiveLosses);
    if (!cbCheck.ok) {
      checks.circuitBreakerOk = false;
      return { approved: false, reason: cbCheck.reason, checks };
    }

    // 2. Position size check
    const orderSizeUsd = order.size * order.price;
    const posCheck = evaluatePositionSizeCheck(orderSizeUsd, this.config.capitalUsdc, this.config.maxPositionFraction);
    if (!posCheck.ok) {
      checks.positionSizeOk = false;
      return { approved: false, reason: posCheck.reason, checks };
    }

    // 3. Daily drawdown check
    const ddCheck = evaluateDailyDrawdownCheck(this.dailyPnl, this.config.capitalUsdc, this.config.maxDailyDrawdown);
    if (!ddCheck.ok) {
      checks.dailyDrawdownOk = false;
      return { approved: false, reason: ddCheck.reason, checks };
    }

    // 4. Concurrent positions check
    if (this.positionTracker) {
      const openCount = this.positionTracker.getPositions().length;
      const cpCheck = evaluateConcurrentPositionsCheck(openCount, this.config.maxConcurrentPositions);
      if (!cpCheck.ok) {
        checks.concurrentLimitOk = false;
        return { approved: false, reason: cpCheck.reason, checks };
      }
    }

    return { approved: true, checks };
  }

  /** Record a winning trade */
  recordWin(pnl: number): void {
    this.consecutiveLosses = 0;
    this.totalWins++;
    this.dailyPnl += pnl;
  }

  /** Record a losing trade — trips circuit breaker after maxConsecutiveLosses */
  recordLoss(pnl: number): void {
    this.consecutiveLosses++;
    this.totalLosses++;
    this.dailyPnl += pnl; // pnl is negative

    if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
      this.circuitTripped = true;
      setCircuitBreakerState(true);
      logger.error(
        `Circuit breaker tripped after ${this.consecutiveLosses} consecutive losses`,
        'LiveExecutionGuard',
        {
          dailyPnl: this.dailyPnl.toFixed(2),
          totalLosses: this.totalLosses,
        },
      );
    }
  }

  /** Manually reset the circuit breaker */
  resetCircuit(): void {
    this.circuitTripped = false;
    setCircuitBreakerState(false);
    this.consecutiveLosses = 0;
    logger.info('Circuit breaker reset', 'LiveExecutionGuard');
  }

  /** Reset daily P&L (called at start of new trading day) */
  resetDaily(): void {
    this.dailyPnl = 0;
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

  /** Enable or disable the guard at runtime */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`Guard ${enabled ? 'ENABLED' : 'DISABLED'}`, 'LiveExecutionGuard');
  }

  getConfig(): Readonly<GuardConfig> {
    return this.config;
  }
}
