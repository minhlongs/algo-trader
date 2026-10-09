/**
 * Portfolio Rebalance Guard
 *
 * Monitors portfolio allocation drift and triggers rebalance alerts
 * when positions exceed target allocation bounds. Enforces a cooldown
 * between rebalance actions to prevent over-trading.
 *
 * @module desk/risk/portfolio-rebalance-guard
 */

import { logger } from '../../shared/utils/logger';
import {
  type AllocationTarget,
  type PositionSnapshot,
  type RebalanceGuardConfig,
  type RebalanceStatus,
  type RebalanceGuardResult,
  DEFAULT_REBALANCE_GUARD_CONFIG,
} from './portfolio-rebalance-types';
import { computeRebalanceStatus } from './portfolio-rebalance-calculator';

export type {
  AllocationTarget,
  PositionSnapshot,
  RebalanceGuardConfig,
  RebalanceStatus,
  RebalanceGuardResult,
} from './portfolio-rebalance-types';

export class PortfolioRebalanceGuard {
  private readonly config: RebalanceGuardConfig;
  private targets: AllocationTarget[] = [];
  private lastRebalanceAt: number | null = null;
  private rebalanceCount = 0;
  private rebalanceDayStart = 0;

  constructor(config: Partial<RebalanceGuardConfig> = {}) {
    this.config = { ...DEFAULT_REBALANCE_GUARD_CONFIG, ...config };
  }

  /** Set or update target allocations (must sum to ~1.0) */
  setTargets(targets: AllocationTarget[]): void {
    this.targets = targets;
  }

  /** Get current targets */
  getTargets(): readonly AllocationTarget[] {
    return this.targets;
  }

  /**
   * Check whether a rebalance action is permitted.
   * Returns allowed: false if cooldown active or daily limit reached.
   */
  check(positions: PositionSnapshot[]): RebalanceGuardResult {
    const status = this.computeStatus(positions);

    // Cooldown check
    if (this.lastRebalanceAt !== null) {
      const elapsed = Date.now() - this.lastRebalanceAt;
      if (elapsed < this.config.rebalanceCooldownMs) {
        const remainingSec = Math.ceil((this.config.rebalanceCooldownMs - elapsed) / 1000);
        return {
          allowed: false,
          reason: `Rebalance cooldown active — ${remainingSec}s remaining`,
          status,
        };
      }
    }

    // Daily limit check
    this.maybeResetDailyCounter();
    if (this.rebalanceCount >= this.config.maxDailyRebalances) {
      return {
        allowed: false,
        reason: `Daily rebalance limit reached (${this.config.maxDailyRebalances})`,
        status,
      };
    }

    return { allowed: true, status };
  }

  /** Record that a rebalance action was performed */
  recordRebalance(): void {
    this.maybeResetDailyCounter();
    this.lastRebalanceAt = Date.now();
    this.rebalanceCount++;
    logger.info('Rebalance recorded', 'PortfolioRebalanceGuard', {
      rebalancesToday: this.rebalanceCount,
    });
  }

  /** Get current status without gating */
  getStatus(positions: PositionSnapshot[]): RebalanceStatus {
    return this.computeStatus(positions);
  }

  /** Reset daily counter and cooldown (e.g. at start of new trading day) */
  resetDaily(): void {
    this.rebalanceCount = 0;
    this.rebalanceDayStart = Date.now();
    this.lastRebalanceAt = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private computeStatus(positions: PositionSnapshot[]): RebalanceStatus {
    return computeRebalanceStatus({
      targets: this.targets,
      positions,
      maxDriftPct: this.config.maxDriftPct,
      lastRebalanceAt: this.lastRebalanceAt,
      rebalancesToday: this.rebalanceCount,
    });
  }

  private maybeResetDailyCounter(): void {
    const now = Date.now();
    const dayMs = 86_400_000;
    if (now - this.rebalanceDayStart >= dayMs) {
      this.rebalanceCount = 0;
      this.rebalanceDayStart = now;
    }
  }
}
