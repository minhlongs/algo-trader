/**
 * Atomic multi-leg arbitrage execution coordinator.
 *
 * Coordinates concurrent and staged multi-leg orders with millisecond timeouts,
 * 6-state lifecycle tracking, and automatic compensatory unwinding.
 *
 * @module desk/arbitrage/execution/atomic-multileg-coordinator
 */

import { logger } from '../../../shared/utils/logger';
import type { IExchangeConnector } from '../connectors/types';
import {
  type MultiLegExecutionPlan,
  type MultiLegExecutionReport,
  type LegExecutionRecord,
  type LegOrderSpec,
  type ExecutionState,
  calculateMultiLegRealizedPnl,
} from './atomic-multileg-types';
import { CompensatoryUnwindHandler } from './compensatory-unwind-handler';

export class AtomicMultiLegCoordinator {
  private readonly unwindHandler: CompensatoryUnwindHandler;

  constructor(
    private readonly connectorResolver: (venue: string) => IExchangeConnector | undefined,
    unwindHandler?: CompensatoryUnwindHandler,
  ) {
    this.unwindHandler = unwindHandler ?? new CompensatoryUnwindHandler(connectorResolver);
  }

  /**
   * Execute multi-leg arbitrage with atomicity guarantees.
   */
  async execute(plan: MultiLegExecutionPlan): Promise<MultiLegExecutionReport> {
    const startTime = Date.now();
    let currentState: ExecutionState = 'PENDING';
    logger.info('[AtomicMultiLegCoordinator] Initiating execution plan', {
      executionId: plan.executionId,
      opportunityId: plan.opportunityId,
      strategy: plan.executionStrategy ?? 'concurrent',
      legsCount: plan.legs.length,
    });

    currentState = 'SUBMITTED';
    const legResults: LegExecutionRecord[] = [];

    if (plan.executionStrategy === 'staged') {
      await this.executeStaged(plan, legResults);
    } else {
      await this.executeConcurrent(plan, legResults);
    }

    const allFilled =
      legResults.length === plan.legs.length &&
      legResults.every((r) => r.status === 'filled' && r.filledAmount >= r.requestedAmount);

    if (allFilled) {
      currentState = 'FILLED';
      const realizedPnl = calculateMultiLegRealizedPnl(legResults);
      logger.info('[AtomicMultiLegCoordinator] Execution plan filled successfully', {
        executionId: plan.executionId,
        realizedPnlUsd: realizedPnl,
        latencyMs: Date.now() - startTime,
      });

      return {
        executionId: plan.executionId,
        opportunityId: plan.opportunityId,
        state: currentState,
        legs: legResults,
        netRealizedPnlUsd: realizedPnl,
        latencyMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    // Partial fill or failure occurred — initiate compensatory unwinds
    currentState = 'PARTIAL_UNWINDING';
    logger.warn('[AtomicMultiLegCoordinator] Leg failure detected — starting compensatory unwind', {
      executionId: plan.executionId,
      failedLegs: legResults.filter((r) => r.status !== 'filled').map((r) => r.legId),
    });

    const unwindReport = await this.unwindHandler.executeUnwind(plan.executionId, legResults);
    currentState = unwindReport.success ? 'UNWOUND' : 'FAILED';

    return {
      executionId: plan.executionId,
      opportunityId: plan.opportunityId,
      state: currentState,
      legs: legResults,
      unwindReport,
      error: unwindReport.error ?? 'Arbitrage legs failed to fill completely; unwound.',
      latencyMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  private async executeConcurrent(
    plan: MultiLegExecutionPlan,
    outRecords: LegExecutionRecord[],
  ): Promise<void> {
    const promises = plan.legs.map((leg) => this.executeSingleLeg(leg));
    const settled = await Promise.allSettled(promises);

    for (let i = 0; i < settled.length; i++) {
      const res = settled[i];
      if (res.status === 'fulfilled') {
        outRecords.push(res.value);
      } else {
        const leg = plan.legs[i];
        outRecords.push({
          legId: leg.legId, venue: leg.venue, symbol: leg.symbol, side: leg.side,
          requestedAmount: leg.amount, filledAmount: 0, price: leg.price, status: 'failed',
          latencyMs: 0, error: res.reason instanceof Error ? res.reason.message : String(res.reason),
        });
      }
    }
  }

  private async executeStaged(
    plan: MultiLegExecutionPlan,
    outRecords: LegExecutionRecord[],
  ): Promise<void> {
    for (const leg of plan.legs) {
      const record = await this.executeSingleLeg(leg);
      outRecords.push(record);
      if (record.status !== 'filled' || record.filledAmount < record.requestedAmount) break;
    }
  }

  private async executeSingleLeg(leg: LegOrderSpec): Promise<LegExecutionRecord> {
    const connector = this.connectorResolver(leg.venue);
    const start = Date.now();
    if (!connector) {
      return {
        legId: leg.legId, venue: leg.venue, symbol: leg.symbol, side: leg.side,
        requestedAmount: leg.amount, filledAmount: 0, price: leg.price, status: 'failed',
        latencyMs: 0, error: `No connector found for venue ${leg.venue}`,
      };
    }

    const timeout = leg.timeoutMs ?? 500;
    try {
      const orderPromise = connector.placeOrder({
        symbol: leg.symbol,
        side: leg.side,
        type: leg.type,
        amount: leg.amount,
        price: leg.price,
        clientOrderId: `${leg.legId}-${Date.now()}`,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Leg ${leg.legId} timed out after ${timeout}ms`)), timeout),
      );

      const res = await Promise.race([orderPromise, timeoutPromise]);
      const isFilled = res.status === 'closed' || res.filled >= leg.amount;

      return {
        legId: leg.legId,
        orderId: res.orderId,
        clientOrderId: res.clientOrderId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: res.filled,
        price: res.price,
        avgFillPrice: res.price,
        status: isFilled ? 'filled' : res.filled > 0 ? 'partial' : 'failed',
        fee: res.fee,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        legId: leg.legId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        price: leg.price,
        status: 'failed',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
