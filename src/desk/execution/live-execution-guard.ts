/**
 * Live Execution Guard
 *
 * Pre-execution safety gate — the LAST line of defense before an order reaches
 * the Polymarket CLOB. Every live trade passes through all 4 checks:
 *
 *   1. Position size ≤ maxPositionFraction of bankroll (quarter-Kelly default)
 *   2. Daily drawdown ≤ maxDailyDrawdown (5% default)
 *   3. Concurrent positions < maxConcurrentPositions (10 default)
 *   4. Circuit breaker is CLOSED (3 consecutive losses → OPEN)
 *
 * Composes existing risk infra — does not rewrite it.
 */

import type { LivePositionTracker } from './live-position-tracker';
import type { PolymarketOrder } from './polymarket-signer';
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GuardConfig {
  /** Max fraction of capital allowed per position (default: 0.02 = 2%) */
  maxPositionFraction: number;
  /** Max daily drawdown before ALL trading halts (default: 0.05 = 5%) */
  maxDailyDrawdown: number;
  /** Max number of concurrent open positions (default: 10) */
  maxConcurrentPositions: number;
  /** Consecutive losses that trip the circuit breaker (default: 3) */
  maxConsecutiveLosses: number;
  /** Total capital for position size calculation */
  capitalUsdc: number;
  /** Set to false to disable the guard (PAPER mode) */
  enabled: boolean;
}

export interface GuardChecks {
  positionSizeOk: boolean;
  dailyDrawdownOk: boolean;
  concurrentLimitOk: boolean;
  circuitBreakerOk: boolean;
}

export interface GuardResult {
  approved: boolean;
  reason?: string;
  checks: GuardChecks;
}

export interface GuardStatus {
  enabled: boolean;
  consecutiveLosses: number;
  totalLosses: number;
  totalWins: number;
  circuitTripped: boolean;
  dailyPnl: number;
  openPositions: number;
}

const DEFAULT_CONFIG: Omit<GuardConfig, 'capitalUsdc'> = {
  maxPositionFraction: 0.02,
  maxDailyDrawdown: 0.05,
  maxConcurrentPositions: 10,
  maxConsecutiveLosses: 3,
  enabled: false, // DISABLED by default — operator must opt into live trading
};

// ── Guard ──────────────────────────────────────────────────────────────────────

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

  // ── Guard check (hot path — runs before every live order) ──────────────────

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
    if (this.circuitTripped) {
      checks.circuitBreakerOk = false;
      return {
        approved: false,
        reason: `Circuit breaker tripped after ${this.config.maxConsecutiveLosses} consecutive losses. Trading halted.`,
        checks,
      };
    }

    // 2. Position size check
    const maxPositionUsd = this.config.capitalUsdc * this.config.maxPositionFraction;
    const orderSizeUsd = order.size * order.price;
    if (orderSizeUsd > maxPositionUsd) {
      checks.positionSizeOk = false;
      return {
        approved: false,
        reason: `Order size $${orderSizeUsd.toFixed(2)} exceeds max position $${maxPositionUsd.toFixed(2)} (${(this.config.maxPositionFraction * 100).toFixed(0)}% of capital)`,
        checks,
      };
    }

    // 3. Daily drawdown check
    const drawdownFraction = this.config.capitalUsdc > 0
      ? Math.abs(Math.min(0, this.dailyPnl)) / this.config.capitalUsdc
      : 0;
    if (drawdownFraction >= this.config.maxDailyDrawdown) {
      checks.dailyDrawdownOk = false;
      return {
        approved: false,
        reason: `Daily drawdown ${(drawdownFraction * 100).toFixed(1)}% exceeds limit ${(this.config.maxDailyDrawdown * 100).toFixed(0)}%`,
        checks,
      };
    }

    // 4. Concurrent positions check
    if (this.positionTracker) {
      const openCount = this.positionTracker.getPositions().length;
      if (openCount >= this.config.maxConcurrentPositions) {
        checks.concurrentLimitOk = false;
        return {
          approved: false,
          reason: `Open positions (${openCount}) at max (${this.config.maxConcurrentPositions})`,
          checks,
        };
      }
    }

    return { approved: true, checks };
  }

  // ── Trade recording ────────────────────────────────────────────────────────

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
    this.consecutiveLosses = 0;
    logger.info('Circuit breaker reset', 'LiveExecutionGuard');
  }

  /** Reset daily P&L (called at start of new trading day) */
  resetDaily(): void {
    this.dailyPnl = 0;
  }

  // ── Status ─────────────────────────────────────────────────────────────────

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
