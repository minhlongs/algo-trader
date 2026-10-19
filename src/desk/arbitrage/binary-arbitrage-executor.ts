/**
 * Binary Arbitrage Executor
 * Executes binary prediction market arbitrage trades on Polymarket.
 * Uses fractional Kelly Criterion (25-50%) for position sizing.
 * Always apply dryRun=true in production until fully validated.
 */

import { BinaryArbitrageOpportunity, ExecutionResult, ExecutedLeg } from './types';
import {
  type BinaryExecutorConfig,
  type ExecutionLogEntry,
  DEFAULT_BINARY_EXECUTOR_CONFIG,
  buildBinaryExecutedLegs,
  buildBinaryExecutionResult,
  calculateBinarySettlementProfit,
} from './binary-arbitrage-helpers';

export * from './binary-arbitrage-helpers';

export class BinaryArbitrageExecutor {
  private config: BinaryExecutorConfig;
  private executionLog: ExecutionLogEntry[] = [];
  private currentPnL = 0;

  constructor(config: Partial<BinaryExecutorConfig> = {}) {
    this.config = { ...DEFAULT_BINARY_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Execute or simulate a binary arbitrage opportunity.
   * Applies Kelly sizing, drawdown guard, and dryRun bypass.
   */
  async execute(opportunity: BinaryArbitrageOpportunity): Promise<ExecutionResult> {
    const bankroll = this.config.maxPositionSize;
    const positionSize = this.calculateKellySize(
      opportunity.mispricing,
      opportunity.confidence / 100,
      bankroll
    );

    if (!this.checkDrawdownLimit(this.currentPnL)) {
      this.log(opportunity.id, positionSize, 'skipped', 'Drawdown limit reached');
      return this.buildResult(opportunity, false, [], 0, 'Drawdown limit reached');
    }

    if (this.config.dryRun) {
      this.log(opportunity.id, positionSize, 'executed');
      return this.simulateExecution(opportunity, positionSize);
    }

    try {
      const executedLegs = await this.placeOrders(opportunity, positionSize);
      const profit = this.calculateProfit(executedLegs, opportunity);
      this.currentPnL += profit;
      this.log(opportunity.id, positionSize, 'executed');
      return this.buildResult(opportunity, true, executedLegs, profit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.log(opportunity.id, positionSize, 'failed', msg);
      return this.buildResult(opportunity, false, [], 0, msg);
    }
  }

  /**
   * Calculate Kelly position size.
   * Formula: f* = (bp - q) / b, then apply fraction for safety.
   * ALWAYS use fractional Kelly — never full Kelly.
   */
  calculateKellySize(edge: number, confidence: number, bankroll: number): number {
    const adjustedEdge = edge * confidence;
    const p = 0.5 + adjustedEdge;
    const q = 1 - p;
    const b = 1;
    const fullKelly = (b * p - q) / b;
    const fractionalKelly = Math.max(0, fullKelly) * this.config.kellyFraction;
    const raw = bankroll * fractionalKelly;
    return Math.min(raw, this.config.maxPositionSize);
  }

  /**
   * Check whether current drawdown is within allowed limit.
   * Returns false (halt) when losses exceed maxDrawdownPct of maxPositionSize.
   */
  checkDrawdownLimit(currentPnL: number): boolean {
    if (currentPnL >= 0) return true;
    const drawdownFraction = Math.abs(currentPnL) / this.config.maxPositionSize;
    return drawdownFraction < this.config.maxDrawdownPct;
  }

  /** Read-only access to execution log for audit/reporting */
  getExecutionLog(): ReadonlyArray<ExecutionLogEntry> {
    return this.executionLog;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private simulateExecution(opp: BinaryArbitrageOpportunity, positionSize: number): ExecutionResult {
    const simulatedLegs = buildBinaryExecutedLegs(opp, positionSize, false);
    const profit = opp.mispricing * positionSize;
    return this.buildResult(opp, true, simulatedLegs, profit);
  }

  private async placeOrders(opp: BinaryArbitrageOpportunity, positionSize: number): Promise<ExecutedLeg[]> {
    return buildBinaryExecutedLegs(opp, positionSize, true);
  }

  private calculateProfit(legs: ExecutedLeg[], _opp: BinaryArbitrageOpportunity): number {
    return calculateBinarySettlementProfit(legs);
  }

  private buildResult(
    opp: BinaryArbitrageOpportunity,
    success: boolean,
    legs: ExecutedLeg[],
    profit: number,
    error?: string
  ): ExecutionResult {
    return buildBinaryExecutionResult(opp, success, legs, profit, error);
  }

  private log(
    opportunityId: string,
    positionSize: number,
    result: ExecutionLogEntry['result'],
    reason?: string
  ): void {
    this.executionLog.push({ opportunityId, timestamp: Date.now(), positionSize, dryRun: this.config.dryRun, result, reason });
  }
}
