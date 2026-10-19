/**
 * Atomic Multi-Leg Arbitrage Execution Coordinator.
 *
 * Coordinates concurrent and staged/sequential multi-leg orders with millisecond-precision timeouts,
 * pre-trade risk gates (ArbitrageRiskGuard), 6-state execution lifecycle tracking,
 * and automatic compensatory unwinding on partial fills or leg failures.
 *
 * @module desk/arbitrage/atomic-multileg-coordinator
 */

import { logger } from '../../shared/utils/logger';
import type { ArbitrageRiskGuard } from './arbitrage-risk-guard';
import {
  type ExecutionState,
  type ExecutionStateTransition,
  type MultiLegArbitrageOrder,
  type LegExecutionReport,
  type MultiLegExecutionReport,
  MultiLegArbitrageOrderSchema,
} from './execution-types';
import {
  CompensatoryUnwindHandler,
  type ConnectorResolver,
} from './compensatory-unwind-handler';
import {
  executeConcurrentLegs,
  executeSequentialLegs,
} from './execution/multileg-batch-executor';
import { buildArbitrageBasket } from './execution/multileg-risk-helper';
import { handleMultiLegUnwind } from './execution/multileg-unwind-orchestrator';
import {
  type CoordinatorOptions,
  areAllMultiLegsFilled,
  buildFilledMultiLegReport,
  buildRiskRejectedMultiLegReport,
  resolveCoordinatorDependencies,
} from './atomic-multileg-helpers';

export * from './execution-types';
export * from './compensatory-unwind-handler';
export * from './atomic-multileg-helpers';

export class AtomicMultiLegCoordinator {
  private readonly unwindHandler: CompensatoryUnwindHandler;
  private readonly riskGuard?: ArbitrageRiskGuard;
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly connectorResolver: ConnectorResolver,
    unwindHandlerOrOptions?: CompensatoryUnwindHandler | CoordinatorOptions,
    riskGuard?: ArbitrageRiskGuard,
  ) {
    const resolved = resolveCoordinatorDependencies(
      connectorResolver,
      unwindHandlerOrOptions,
      riskGuard,
    );
    this.unwindHandler = resolved.unwindHandler;
    this.riskGuard = resolved.riskGuard;
    this.defaultTimeoutMs = resolved.defaultTimeoutMs;
  }

  /**
   * Execute a multi-leg arbitrage order with atomic lifecycle guarantees.
   */
  async execute(order: MultiLegArbitrageOrder): Promise<MultiLegExecutionReport> {
    const startTime = Date.now();
    const stateHistory: ExecutionStateTransition[] = [];
    let currentState: ExecutionState = 'PENDING';

    const recordTransition = (to: ExecutionState, reason?: string) => {
      stateHistory.push({ from: currentState, to, timestamp: Date.now(), reason });
      currentState = to;
    };

    const parsedOrder = MultiLegArbitrageOrderSchema.parse(order);
    const executionMode = parsedOrder.executionMode ?? 'concurrent';

    logger.info('[AtomicMultiLegCoordinator] Ingested arbitrage order for atomic execution', {
      orderId: parsedOrder.orderId,
      opportunityId: parsedOrder.opportunityId,
      mode: executionMode,
      legsCount: parsedOrder.legs.length,
    });

    const basket = buildArbitrageBasket(parsedOrder);
    if (this.riskGuard) {
      const riskCheck = await this.riskGuard.checkBasket(basket);
      if (!riskCheck.allowed) {
        const errorMsg = `Pre-trade risk check failed: ${riskCheck.rejectionReason ?? 'RISK_REJECTED'}`;
        recordTransition('FAILED', errorMsg);
        return buildRiskRejectedMultiLegReport(
          parsedOrder,
          stateHistory,
          startTime,
          riskCheck.rejectionReason,
        ).report;
      }
      this.riskGuard.recordTradeOpened(basket);
    }

    let legResults: LegExecutionReport[] = [];
    const abortController = new AbortController();

    try {
      recordTransition('SUBMITTED', 'Order dispatched to execution venues');

      const executeFn =
        executionMode === 'sequential' ? executeSequentialLegs : executeConcurrentLegs;
      legResults = await executeFn(
        this.connectorResolver,
        parsedOrder.legs,
        this.defaultTimeoutMs,
        abortController.signal,
      );

      if (areAllMultiLegsFilled(legResults, parsedOrder.legs.length)) {
        recordTransition('FILLED', 'All arbitrage legs filled completely');
        return buildFilledMultiLegReport(parsedOrder, stateHistory, legResults, startTime);
      }

      return await handleMultiLegUnwind({
        connectorResolver: this.connectorResolver,
        unwindHandler: this.unwindHandler,
        parsedOrder,
        legResults,
        stateHistory,
        currentState,
        startTime,
        recordTransition,
      });
    } finally {
      if (this.riskGuard) {
        this.riskGuard.recordTradeClosed(basket);
      }
    }
  }
}
