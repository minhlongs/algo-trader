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
import {
  executeSingleLeg,
  executeConcurrentLegs,
  executeStagedLegs,
} from './atomic-multileg-leg-runner';

export { executeSingleLeg, executeConcurrentLegs, executeStagedLegs };

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
      await executeStagedLegs(plan, legResults, this.connectorResolver);
    } else {
      await executeConcurrentLegs(plan, legResults, this.connectorResolver);
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
}

