/**
 * Live Trading Orchestrator — Strategy Executor
 *
 * Handles strategy tick execution, paper trade PnL tracking,
 * 30-day paper-to-live gating mechanism, and risk-gate integration.
 * Reference: docs/transition-criteria.md
 */

import type { RiskGateManager } from '../risk/risk-gate-manager';
import type { PaperTradeStats } from './live-trading-types';
import {
  type StrategyPaperProfile,
  type PaperToLiveEvaluationResult,
  type GatingCriteriaConfig,
  type StrategyTradingTier,
  DEFAULT_GATING_CONFIG,
} from './live-trading-gating-types';
import { evaluatePaperToLiveGating } from './live-trading-gating-evaluator';

export type {
  StrategyTradingTier,
  StrategyPaperProfile,
  PaperToLiveEvaluationResult,
  GatingCriteriaConfig,
} from './live-trading-gating-types';

export type StrategyTickFn = (tickData: TickContext) => Promise<void>;

export interface TickContext {
  capitalUsdc: number;
  allocatedUsdc: number;
  positions: Map<string, unknown>;
  riskManager: RiskGateManager;
  mode?: 'PAPER' | 'LIVE';
}

export interface TickExecutionOptions {
  mode?: 'PAPER' | 'LIVE';
  currentTimeMs?: number;
}

export class LiveTradingStrategyExecutor {
  private paperStats = new Map<string, PaperTradeStats>();
  private paperProfiles = new Map<string, StrategyPaperProfile>();
  private strategyErrors = new Map<string, { count: number; lastError: string }>();
  private gatingConfig: GatingCriteriaConfig;

  constructor(
    private readonly riskManager: RiskGateManager,
    private readonly log: (msg: string, ctx: string, meta?: Record<string, unknown>) => void,
    gatingConfig?: Partial<GatingCriteriaConfig>,
  ) {
    this.gatingConfig = { ...DEFAULT_GATING_CONFIG, ...gatingConfig };
  }

  /**
   * Execute a strategy tick with risk-gate pre-check, paper-to-live gate verification, and error boundary.
   */
  async executeStrategyTick(
    strategyKey: string,
    tickFn: StrategyTickFn,
    tickData: TickContext,
    options?: TickExecutionOptions,
  ): Promise<{ success: boolean; error?: string; gatingResult?: PaperToLiveEvaluationResult }> {
    const mode = options?.mode ?? tickData.mode ?? 'PAPER';
    const now = options?.currentTimeMs ?? Date.now();

    // --- 30-day Paper-to-Live Gating Enforcement ---
    if (mode === 'LIVE') {
      const gatingResult = this.evaluateGating(strategyKey, now);
      if (!gatingResult.eligible) {
        const errorMsg = `Live execution blocked by Paper-to-Live Gating: ${gatingResult.rejectionReasons.join('; ')}`;
        this.log(errorMsg, 'Orchestrator', { strategyKey, gatingResult });
        return { success: false, error: errorMsg, gatingResult };
      }
    }

    // --- Risk gate pre-check ---
    const gateResult = await this.riskManager.check(strategyKey);
    if (!gateResult.allowed) {
      this.log(`Risk gate blocked strategy ${strategyKey}: ${gateResult.reason}`, 'Orchestrator', {
        strategyKey,
        reason: gateResult.reason,
      });
      return { success: false, error: gateResult.reason };
    }

    // --- Execute tick with error boundary ---
    try {
      await tickFn(tickData);
      this.strategyErrors.delete(strategyKey);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const prev = this.strategyErrors.get(strategyKey) ?? { count: 0, lastError: '' };
      this.strategyErrors.set(strategyKey, {
        count: prev.count + 1,
        lastError: errorMsg,
      });
      this.log(`Strategy tick failed for ${strategyKey}`, 'Orchestrator', {
        strategyKey,
        error: errorMsg,
        consecutiveFailures: prev.count + 1,
      });
      return { success: false, error: errorMsg };
    }
  }

  /** Register or update a strategy's paper trading profile */
  registerPaperProfile(profile: StrategyPaperProfile): void {
    this.paperProfiles.set(profile.strategyKey, { ...profile });
  }

  /** Get paper profile for a strategy */
  getPaperProfile(strategyKey: string): StrategyPaperProfile | undefined {
    return this.paperProfiles.get(strategyKey);
  }

  /** Evaluate 10-gate paper-to-live transition eligibility */
  evaluateGating(strategyKey: string, currentTimeMs = Date.now()): PaperToLiveEvaluationResult {
    let profile = this.paperProfiles.get(strategyKey);
    if (!profile) {
      const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
      profile = {
        strategyKey,
        paperStartDate: currentTimeMs,
        totalPaperTrades: stats.paperTrades,
        winningTrades: stats.paperPnl > 0 ? stats.paperTrades : 0,
        losingTrades: stats.paperPnl < 0 ? stats.paperTrades : 0,
        grossProfitUsd: stats.paperPnl > 0 ? stats.paperPnl : 0,
        grossLossUsd: stats.paperPnl < 0 ? Math.abs(stats.paperPnl) : 0,
        maxDrawdown: 0.0,
        sharpeRatio: 0.0,
      };
      this.paperProfiles.set(strategyKey, profile);
    }
    return evaluatePaperToLiveGating(profile, this.gatingConfig, currentTimeMs);
  }

  /** Record a paper trade PnL delta and update profile stats. */
  updatePaperPnl(strategyKey: string, pnlDelta: number): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperPnl += pnlDelta;
    this.paperStats.set(strategyKey, stats);

    const profile = this.paperProfiles.get(strategyKey);
    if (profile) {
      if (pnlDelta > 0) {
        profile.winningTrades += 1;
        profile.grossProfitUsd += pnlDelta;
      } else if (pnlDelta < 0) {
        profile.losingTrades += 1;
        profile.grossLossUsd += Math.abs(pnlDelta);
      }
      this.paperProfiles.set(strategyKey, profile);
    }
  }

  /** Record a paper trade execution. */
  recordPaperTrade(strategyKey: string): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperTrades += 1;
    this.paperStats.set(strategyKey, stats);

    const profile = this.paperProfiles.get(strategyKey);
    if (profile) {
      profile.totalPaperTrades += 1;
      this.paperProfiles.set(strategyKey, profile);
    }
  }

  /** Get per-strategy paper trade stats (read-only view). */
  getPaperStats(): ReadonlyMap<string, PaperTradeStats> {
    return this.paperStats;
  }

  /** Get per-strategy error counts (for health dashboard). */
  getStrategyErrors(): ReadonlyMap<string, { count: number; lastError: string }> {
    return this.strategyErrors;
  }

  /** Restore paper stats from a persistence snapshot. */
  restorePaperStats(entries: Array<[string, { paperTrades: number; paperPnl: number }]>): void {
    this.paperStats = new Map(entries);
  }

  /** Clear all tracked stats (fresh start). */
  clearStats(): void {
    this.paperStats.clear();
    this.paperProfiles.clear();
    this.strategyErrors.clear();
  }

  /** Access the RiskGateManager (for external consumers). */
  getRiskManager(): RiskGateManager {
    return this.riskManager;
  }
}
