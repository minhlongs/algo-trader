/**
 * Atomic Multi-Leg Basket Execution Coordinator
 * Coordinates staged and concurrent multi-leg bundle execution with millisecond timeouts,
 * 6-state lifecycle tracking, and automated compensatory unwinds on partial fills.
 */

import { logger } from '../../../shared/utils/logger';
import {
  ArbitrageLeg,
  ArbitrageOpportunity,
  BundleExecutionResult,
  BundleExecutionState,
  ExecutionLeg,
} from '../types/arbitrage-types';
import { CompensatoryUnwindHandler } from './compensatory-unwind-handler';
import {
  type LegExecutionFn,
  type CoordinatorConfig,
  defaultBasketLegExec,
  executeBasketLegWithTimeout,
  executeBasketLegsConcurrent,
  executeBasketLegsStaged,
  calcBasketSuccessPnl,
} from './atomic-basket-helpers';

export type { LegExecutionFn, CoordinatorConfig };
export {
  defaultBasketLegExec,
  executeBasketLegWithTimeout,
  executeBasketLegsConcurrent,
  executeBasketLegsStaged,
  calcBasketSuccessPnl,
};

export class AtomicBasketCoordinator {
  public static async executeOpportunity(
    opp: ArbitrageOpportunity,
    config?: CoordinatorConfig,
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
    cfg?: CoordinatorConfig,
  ): Promise<ExecutionLeg[]> {
    return executeBasketLegsConcurrent(legs, size, timeout, cfg);
  }

  private static async executeStaged(
    legs: ArbitrageLeg[],
    size: number,
    timeout: number,
    cfg?: CoordinatorConfig,
  ): Promise<ExecutionLeg[]> {
    return executeBasketLegsStaged(legs, size, timeout, cfg);
  }

  private static calcSuccessPnl(
    opp: ArbitrageOpportunity,
    legs: ExecutionLeg[],
    feeRate: number,
    gasUsed: number,
  ): number {
    return calcBasketSuccessPnl(opp, legs, feeRate, gasUsed);
  }
}
