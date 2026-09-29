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
  calculateMultiLegRealizedPnl,
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

export * from './execution-types';
export * from './compensatory-unwind-handler';

export interface CoordinatorOptions {
  /** ArbitrageRiskGuard instance for pre-trade risk gating & exposure tracking */
  riskGuard?: ArbitrageRiskGuard;
  /** CompensatoryUnwindHandler instance */
  unwindHandler?: CompensatoryUnwindHandler;
  /** Default leg timeout in ms if not specified per leg (default: 500ms) */
  defaultTimeoutMs?: number;
}

export class AtomicMultiLegCoordinator {
  private readonly unwindHandler: CompensatoryUnwindHandler;
  private readonly riskGuard?: ArbitrageRiskGuard;
  private readonly defaultTimeoutMs: number;

  constructor(
    private readonly connectorResolver: ConnectorResolver,
    unwindHandlerOrOptions?: CompensatoryUnwindHandler | CoordinatorOptions,
    riskGuard?: ArbitrageRiskGuard,
  ) {
    if (unwindHandlerOrOptions && 'executeUnwind' in unwindHandlerOrOptions) {
      this.unwindHandler = unwindHandlerOrOptions;
      this.riskGuard = riskGuard;
      this.defaultTimeoutMs = 500;
    } else {
      const opts = unwindHandlerOrOptions as CoordinatorOptions | undefined;
      this.unwindHandler =
        opts?.unwindHandler ?? new CompensatoryUnwindHandler(connectorResolver);
      this.riskGuard = opts?.riskGuard ?? riskGuard;
      this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 500;
    }
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

    // 0. Validate input order schema
    const parsedOrder = MultiLegArbitrageOrderSchema.parse(order);
    const executionMode = parsedOrder.executionMode ?? 'concurrent';

    logger.info('[AtomicMultiLegCoordinator] Ingested arbitrage order for atomic execution', {
      orderId: parsedOrder.orderId,
      opportunityId: parsedOrder.opportunityId,
      mode: executionMode,
      legsCount: parsedOrder.legs.length,
    });

    // 1. Prepare basket representation & 2. Pre-Trade Risk Gate Checks
    const basket = buildArbitrageBasket(parsedOrder);
    if (this.riskGuard) {
      const riskCheck = await this.riskGuard.checkBasket(basket);
      if (!riskCheck.allowed) {
        const errorMsg = `Pre-trade risk check failed: ${riskCheck.rejectionReason ?? 'RISK_REJECTED'}`;
        recordTransition('FAILED', errorMsg);
        logger.warn('[AtomicMultiLegCoordinator] Pre-trade risk gate rejected order', {
          orderId: parsedOrder.orderId,
          reason: riskCheck.rejectionReason,
        });

        return {
          executionId: parsedOrder.orderId,
          opportunityId: parsedOrder.opportunityId,
          state: 'FAILED',
          stateHistory,
          legs: [],
          latencyMs: Date.now() - startTime,
          error: errorMsg,
          timestamp: Date.now(),
        };
      }
      this.riskGuard.recordTradeOpened(basket);
    }

    let legResults: LegExecutionReport[] = [];
    const abortController = new AbortController();

    try {
      recordTransition('SUBMITTED', 'Order dispatched to execution venues');

      if (executionMode === 'sequential') {
        legResults = await executeSequentialLegs(
          this.connectorResolver,
          parsedOrder.legs,
          this.defaultTimeoutMs,
          abortController.signal,
        );
      } else {
        legResults = await executeConcurrentLegs(
          this.connectorResolver,
          parsedOrder.legs,
          this.defaultTimeoutMs,
          abortController.signal,
        );
      }

      // Check fill status across all legs
      const allFilled =
        legResults.length === parsedOrder.legs.length &&
        legResults.every(
          (leg) => leg.status === 'filled' && leg.remainingAmount === 0 && leg.filledAmount >= leg.requestedAmount,
        );

      if (allFilled) {
        recordTransition('FILLED', 'All arbitrage legs filled completely');
        const netRealizedPnlUsd = calculateMultiLegRealizedPnl(legResults);

        logger.info('[AtomicMultiLegCoordinator] Multi-leg order filled completely', {
          orderId: parsedOrder.orderId,
          netRealizedPnlUsd,
          latencyMs: Date.now() - startTime,
        });

        return {
          executionId: parsedOrder.orderId,
          opportunityId: parsedOrder.opportunityId,
          state: 'FILLED',
          stateHistory,
          legs: legResults,
          netRealizedPnlUsd,
          latencyMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
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
