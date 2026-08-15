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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AllocationTarget {
  tokenId: string;
  targetPct: number;  // 0-1, e.g. 0.25 = 25%
}

export interface PositionSnapshot {
  tokenId: string;
  sizeUsdc: number;
}

export interface RebalanceGuardConfig {
  /** Maximum drift from target before alerting (default 0.05 = 5%) */
  maxDriftPct: number;
  /** Minimum cooldown between rebalance actions in ms (default 300_000 = 5 min) */
  rebalanceCooldownMs: number;
  /** Maximum number of rebalances per day (default 12) */
  maxDailyRebalances: number;
}

export interface RebalanceStatus {
  drift: number;          // current max drift across all positions
  needsRebalance: boolean;
  lastRebalanceAt: number | null;
  rebalancesToday: number;
  driftedPositions: Array<{
    tokenId: string;
    targetPct: number;
    actualPct: number;
    drift: number;
  }>;
}

export interface RebalanceGuardResult {
  allowed: boolean;
  reason?: string;
  status: RebalanceStatus;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RebalanceGuardConfig = {
  maxDriftPct: 0.05,
  rebalanceCooldownMs: 300_000,
  maxDailyRebalances: 12,
};

export class PortfolioRebalanceGuard {
  private readonly config: RebalanceGuardConfig;
  private targets: AllocationTarget[] = [];
  private lastRebalanceAt: number | null = null;
  private rebalanceCount = 0;
  private rebalanceDayStart = 0;

  constructor(config: Partial<RebalanceGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
    if (this.targets.length === 0) {
      return {
        drift: 0,
        needsRebalance: false,
        lastRebalanceAt: this.lastRebalanceAt,
        rebalancesToday: this.rebalanceCount,
        driftedPositions: [],
      };
    }

    const totalUsdc = positions.reduce((sum, p) => sum + p.sizeUsdc, 0);
    if (totalUsdc <= 0) {
      return {
        drift: 0,
        needsRebalance: false,
        lastRebalanceAt: this.lastRebalanceAt,
        rebalancesToday: this.rebalanceCount,
        driftedPositions: [],
      };
    }

    let maxDrift = 0;
    const driftedPositions: RebalanceStatus['driftedPositions'] = [];

    for (const target of this.targets) {
      const pos = positions.find(p => p.tokenId === target.tokenId);
      const actualPct = pos ? pos.sizeUsdc / totalUsdc : 0;
      const drift = Math.abs(actualPct - target.targetPct);

      if (drift > maxDrift) maxDrift = drift;
      if (drift > this.config.maxDriftPct) {
        driftedPositions.push({
          tokenId: target.tokenId,
          targetPct: target.targetPct,
          actualPct,
          drift,
        });
      }
    }

    return {
      drift: maxDrift,
      needsRebalance: driftedPositions.length > 0,
      lastRebalanceAt: this.lastRebalanceAt,
      rebalancesToday: this.rebalanceCount,
      driftedPositions,
    };
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
