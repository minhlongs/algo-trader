/**
 * Atomic Multi-Leg Basket Execution Coordinator
 * Coordinates staged and concurrent multi-leg bundle execution with millisecond timeouts,
 * 6-state lifecycle tracking, and automated compensatory unwinds on partial fills.
 */

import { logger } from '../../../shared/utils/logger';
import { MultiTokenPool } from '../pool/multi-token-pool';
import {
  ArbitrageLeg,
  ArbitrageOpportunity,
  BundleExecutionResult,
  BundleExecutionState,
  ExecutionLeg,
} from '../types/arbitrage-types';
import { CompensatoryUnwindHandler, UnwindOrderExecutor } from './compensatory-unwind-handler';

export type LegExecutionFn = (
  leg: ArbitrageLeg,
  targetSize: number
) => Promise<{ filledSize: number; avgPrice: number; status: 'FILLED' | 'PARTIAL' | 'FAILED' }>;

export interface CoordinatorConfig {
  executionStrategy?: 'concurrent' | 'staged';
  timeoutMs?: number;
  takerFeeBps?: number;
  gasCostUsd?: number;
  pool?: MultiTokenPool;
  legExecutor?: LegExecutionFn;
  unwindExecutor?: UnwindOrderExecutor;
}

export class AtomicBasketCoordinator {
  public static async executeOpportunity(
    opp: ArbitrageOpportunity,
    config?: CoordinatorConfig
  ): Promise<BundleExecutionResult> {
    const startTime = Date.now();
    const bundleId = `bundle-${opp?.marketId ?? 'unknown'}-${startTime}-${Math.random().toString(36).slice(2, 6)}`;
    let state: BundleExecutionState = 'PENDING';

    if (!opp || !opp.legs || opp.legs.length < 2 || opp.maxExecutableSets <= 0) {
      return {
        bundleId,
        opportunityId: opp?.id ?? 'unknown',
        state: 'FAILED',
        executedLegs: [],
        realizedPnlUsd: 0,
        gasUsedUsd: 0,
        feesPaidUsd: 0,
        timestampMs: Date.now(),
      };
    }

    state = 'SUBMITTED';
    const strategy = config?.executionStrategy ?? 'concurrent';
    const timeoutMs = config?.timeoutMs ?? 3000;
    const targetSize = opp.maxExecutableSets;

    const executedLegs = strategy === 'staged'
      ? await this.executeStaged(opp.legs, targetSize, timeoutMs, config)
      : await this.executeConcurrent(opp.legs, targetSize, timeoutMs, config);

    const allFilled = executedLegs.length === opp.legs.length &&
      executedLegs.every((l) => l.status === 'FILLED' && l.filledSize >= l.targetSize);

    const gasUsedUsd = config?.gasCostUsd ?? opp.estimatedGasUsd ?? 0.05;
    const feeRate = (config?.takerFeeBps ?? 10) / 10000;
    const totalFees = executedLegs.reduce((acc, l) => acc + l.filledSize * l.avgFillPrice * feeRate, 0);

    if (allFilled) {
      state = 'FILLED';
      const realizedPnl = this.calcSuccessPnl(opp, executedLegs, feeRate, gasUsedUsd);
      logger.info('[AtomicBasketCoordinator] Bundle filled', { bundleId, realizedPnlUsd: realizedPnl });
      return {
        bundleId,
        opportunityId: opp.id,
        state,
        executedLegs,
        realizedPnlUsd: realizedPnl,
        gasUsedUsd,
        feesPaidUsd: Number(totalFees.toFixed(4)),
        timestampMs: Date.now(),
      };
    }

    // Partial fill or failure -> initiate compensatory unwind
    state = 'PARTIAL_UNWINDING';
    logger.warn('[AtomicBasketCoordinator] Incomplete fills, unwinding', { bundleId });
    const unwindRes = await CompensatoryUnwindHandler.unwindPartialFills(executedLegs, {
      opportunityType: opp.type,
      pool: config?.pool,
      unwindExecutor: config?.unwindExecutor,
      takerFeeBps: config?.takerFeeBps,
    });

    state = unwindRes.completed ? 'UNWOUND' : 'FAILED';
    const postUnwindLegs = unwindRes.postUnwindLegs ?? executedLegs;
    return {
      bundleId,
      opportunityId: opp.id,
      state,
      executedLegs: postUnwindLegs,
      realizedPnlUsd: Number((-unwindRes.residualLossUsd - gasUsedUsd).toFixed(4)),
      gasUsedUsd,
      feesPaidUsd: Number(totalFees.toFixed(4)),
      unwindResult: unwindRes,
      timestampMs: Date.now(),
    };
  }

  private static async executeConcurrent(
    legs: ArbitrageLeg[],
    size: number,
    timeout: number,
    cfg?: CoordinatorConfig
  ): Promise<ExecutionLeg[]> {
    return Promise.all(legs.map((leg, idx) => this.execLeg(leg, idx, size, timeout, cfg)));
  }

  private static async executeStaged(
    legs: ArbitrageLeg[],
    size: number,
    timeout: number,
    cfg?: CoordinatorConfig
  ): Promise<ExecutionLeg[]> {
    const results: ExecutionLeg[] = [];
    for (let idx = 0; idx < legs.length; idx++) {
      const res = await this.execLeg(legs[idx], idx, size, timeout, cfg);
      results.push(res);
      if (res.status !== 'FILLED') break;
    }
    return results;
  }

  private static async execLeg(
    leg: ArbitrageLeg,
    idx: number,
    size: number,
    timeout: number,
    cfg?: CoordinatorConfig
  ): Promise<ExecutionLeg> {
    const p = cfg?.legExecutor ? cfg.legExecutor(leg, size) : this.defaultExec(leg, size, cfg?.pool);
    const tm = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout));
    try {
      const r = await Promise.race([p, tm]);
      return { legIndex: idx, outcomeIndex: leg.outcomeIndex, action: leg.action, targetSize: size, filledSize: r.filledSize, avgFillPrice: r.avgPrice, status: r.status };
    } catch {
      return { legIndex: idx, outcomeIndex: leg.outcomeIndex, action: leg.action, targetSize: size, filledSize: 0, avgFillPrice: leg.price, status: 'FAILED' };
    }
  }

  private static async defaultExec(
    leg: ArbitrageLeg,
    size: number,
    pool?: MultiTokenPool
  ): Promise<{ filledSize: number; avgPrice: number; status: 'FILLED' | 'PARTIAL' | 'FAILED' }> {
    if (pool) {
      const res = pool.executeTrade({
        poolId: pool.poolId,
        outcomeIndex: leg.outcomeIndex,
        action: leg.action,
        amount: size * (leg.action === 'BUY' ? leg.price : 1),
      });
      return { filledSize: size, avgPrice: res.effectivePrice, status: 'FILLED' };
    }
    return { filledSize: size, avgPrice: leg.price, status: 'FILLED' };
  }

  private static calcSuccessPnl(
    opp: ArbitrageOpportunity,
    legs: ExecutionLeg[],
    feeRate: number,
    gasUsed: number
  ): number {
    const targetSize = opp.maxExecutableSets;
    if (opp.type === 'UNDERPRICED_BASKET') {
      const cost = legs.reduce((acc, l) => acc + l.filledSize * l.avgFillPrice * (1 + feeRate), 0);
      return Number((targetSize * 1.0 - cost - gasUsed).toFixed(4));
    }
    const rev = legs.reduce((acc, l) => acc + l.filledSize * l.avgFillPrice * (1 - feeRate), 0);
    return Number((rev - targetSize * 1.0 - gasUsed).toFixed(4));
  }
}
