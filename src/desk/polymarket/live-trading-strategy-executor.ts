/**
 * Live Trading Orchestrator — Strategy Executor
 *
 * Handles strategy tick execution, paper trade PnL tracking,
 * and risk-gate integration. Extracted from LiveTradingOrchestrator.
 */

import type { RiskGateManager } from '../risk/risk-gate-manager';
import type { PaperTradeStats } from './live-trading-types';
import { DEFAULT_RISK_LIMITS } from './live-trading-types';
import type { RiskLimits } from './live-trading-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrategyTickFn = (tickData: TickContext) => Promise<void>;

export interface TickContext {
  capitalUsdc: number;
  allocatedUsdc: number;
  positions: Map<string, unknown>;
  riskManager: RiskGateManager;
}

// ---------------------------------------------------------------------------
// StrategyExecutor — extracted from LiveTradingOrchestrator
// ---------------------------------------------------------------------------

export class LiveTradingStrategyExecutor {
  private paperStats = new Map<string, PaperTradeStats>();
  private strategyErrors = new Map<string, { count: number; lastError: string }>();

  constructor(
    private readonly riskManager: RiskGateManager,
    private readonly log: (msg: string, ctx: string, meta?: Record<string, unknown>) => void,
  ) {}

  /**
   * Execute a strategy tick with risk-gate pre-check and error boundary.
   * - Pre-checks risk gate before executing the tick.
   * - Wraps the tick in try/catch — one strategy failure does not kill others.
   * - Tracks per-strategy error counts for health monitoring.
   */
  async executeStrategyTick(
    strategyKey: string,
    tickFn: StrategyTickFn,
    tickData: TickContext,
  ): Promise<{ success: boolean; error?: string }> {
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
      // Clear error count on success
      this.strategyErrors.delete(strategyKey);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Track per-strategy error counts
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

  /** Record a paper trade PnL delta for a strategy. */
  updatePaperPnl(strategyKey: string, pnlDelta: number): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperPnl += pnlDelta;
    this.paperStats.set(strategyKey, stats);
  }

  /** Record a paper trade execution. */
  recordPaperTrade(strategyKey: string): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperTrades += 1;
    this.paperStats.set(strategyKey, stats);
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
  restorePaperStats(
    entries: Array<[string, { paperTrades: number; paperPnl: number }]>,
  ): void {
    this.paperStats = new Map(entries);
  }

  /** Clear all tracked stats (fresh start). */
  clearStats(): void {
    this.paperStats.clear();
    this.strategyErrors.clear();
  }

  /** Access the RiskGateManager (for external consumers). */
  getRiskManager(): RiskGateManager {
    return this.riskManager;
  }
}
