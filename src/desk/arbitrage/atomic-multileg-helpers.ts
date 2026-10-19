/**
 * Atomic Multi-Leg Coordinator Helpers
 * Extracted dependency resolution, fill verification, and execution report builders.
 */

import { logger } from '../../shared/utils/logger';
import type { ArbitrageRiskGuard } from './arbitrage-risk-guard';
import {
  type ExecutionStateTransition,
  type LegExecutionReport,
  type MultiLegArbitrageOrder,
  type MultiLegExecutionReport,
  calculateMultiLegRealizedPnl,
} from './execution-types';
import {
  CompensatoryUnwindHandler,
  type ConnectorResolver,
} from './compensatory-unwind-handler';

export interface CoordinatorOptions {
  /** ArbitrageRiskGuard instance for pre-trade risk gating & exposure tracking */
  riskGuard?: ArbitrageRiskGuard;
  /** CompensatoryUnwindHandler instance */
  unwindHandler?: CompensatoryUnwindHandler;
  /** Default leg timeout in ms if not specified per leg (default: 500ms) */
  defaultTimeoutMs?: number;
}

export function resolveCoordinatorDependencies(
  connectorResolver: ConnectorResolver,
  unwindHandlerOrOptions?: CompensatoryUnwindHandler | CoordinatorOptions,
  riskGuard?: ArbitrageRiskGuard,
): {
  unwindHandler: CompensatoryUnwindHandler;
  riskGuard?: ArbitrageRiskGuard;
  defaultTimeoutMs: number;
} {
  if (unwindHandlerOrOptions && 'executeUnwind' in unwindHandlerOrOptions) {
    return {
      unwindHandler: unwindHandlerOrOptions,
      riskGuard,
      defaultTimeoutMs: 500,
    };
  }
  const opts = unwindHandlerOrOptions as CoordinatorOptions | undefined;
  return {
    unwindHandler: opts?.unwindHandler ?? new CompensatoryUnwindHandler(connectorResolver),
    riskGuard: opts?.riskGuard ?? riskGuard,
    defaultTimeoutMs: opts?.defaultTimeoutMs ?? 500,
  };
}

export function areAllMultiLegsFilled(
  legResults: LegExecutionReport[],
  expectedLegsCount: number,
): boolean {
  return (
    legResults.length === expectedLegsCount &&
    legResults.every(
      (leg) =>
        leg.status === 'filled' &&
        leg.remainingAmount === 0 &&
        leg.filledAmount >= leg.requestedAmount,
    )
  );
}

export function buildRiskRejectedMultiLegReport(
  parsedOrder: MultiLegArbitrageOrder,
  stateHistory: ExecutionStateTransition[],
  startTime: number,
  rejectionReason?: string,
): { report: MultiLegExecutionReport; errorMsg: string } {
  const errorMsg = `Pre-trade risk check failed: ${rejectionReason ?? 'RISK_REJECTED'}`;
  logger.warn('[AtomicMultiLegCoordinator] Pre-trade risk gate rejected order', {
    orderId: parsedOrder.orderId,
    reason: rejectionReason,
  });
  return {
    errorMsg,
    report: {
      executionId: parsedOrder.orderId,
      opportunityId: parsedOrder.opportunityId,
      state: 'FAILED',
      stateHistory,
      legs: [],
      latencyMs: Date.now() - startTime,
      error: errorMsg,
      timestamp: Date.now(),
    },
  };
}

export function buildFilledMultiLegReport(
  parsedOrder: MultiLegArbitrageOrder,
  stateHistory: ExecutionStateTransition[],
  legResults: LegExecutionReport[],
  startTime: number,
): MultiLegExecutionReport {
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
