/**
 * Unwind orchestration and failure recovery for atomic multi-leg arbitrage.
 *
 * @module desk/arbitrage/execution/multileg-unwind-orchestrator
 */

import { logger } from '../../../shared/utils/logger';
import type { ConnectorResolver } from '../compensatory-unwind-handler';
import type { CompensatoryUnwindHandler } from '../compensatory-unwind-handler';
import type {
  ExecutionState,
  ExecutionStateTransition,
  LegExecutionReport,
  MultiLegArbitrageOrder,
  MultiLegExecutionReport,
} from '../execution-types';
import { cancelOpenLegs } from './multileg-single-leg-executor';

export interface UnwindOrchestrationParams {
  connectorResolver: ConnectorResolver;
  unwindHandler: CompensatoryUnwindHandler;
  parsedOrder: MultiLegArbitrageOrder;
  legResults: LegExecutionReport[];
  stateHistory: ExecutionStateTransition[];
  currentState: ExecutionState;
  startTime: number;
  recordTransition: (to: ExecutionState, reason?: string) => void;
}

/**
 * Handle partial fills or leg failures by canceling open orders and unwinding filled inventory.
 */
export async function handleMultiLegUnwind(
  params: UnwindOrchestrationParams,
): Promise<MultiLegExecutionReport> {
  const {
    connectorResolver,
    unwindHandler,
    parsedOrder,
    legResults,
    stateHistory,
    startTime,
    recordTransition,
  } = params;

  logger.warn('[AtomicMultiLegCoordinator] Order execution failed or partially filled; initiating unwind', {
    orderId: parsedOrder.orderId,
    failedLegs: legResults.filter((l) => l.status !== 'filled').map((l) => l.legId),
  });

  // a. Immediately cancel all pending/open legs
  await cancelOpenLegs(connectorResolver, legResults);

  // Check if any leg actually filled
  const filledLegs = legResults.filter((l) => l.filledAmount > 0);

  if (filledLegs.length === 0) {
    recordTransition('FAILED', 'All legs failed with zero fills');
    return {
      executionId: parsedOrder.orderId,
      opportunityId: parsedOrder.opportunityId,
      state: 'FAILED',
      stateHistory,
      legs: legResults,
      error: 'All legs failed to fill; no exposure created',
      latencyMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // b. Transition state to PARTIAL_UNWINDING
  recordTransition('PARTIAL_UNWINDING', 'Canceling open legs and unwinding filled inventory');

  // c. Call CompensatoryUnwindHandler to unwind filled leg exposure
  const unwindResult = await unwindHandler.executeUnwind({
    executionId: parsedOrder.orderId,
    reason: 'Partial fill imbalance compensatory unwind',
    legsToUnwind: filledLegs.map((leg) => ({
      legId: leg.legId,
      venue: leg.venue,
      symbol: leg.symbol,
      side: leg.side,
      filledAmount: leg.filledAmount,
      entryPrice: leg.avgFillPrice ?? leg.price,
      orderId: leg.orderId,
    })),
  });

  // d. Transition to UNWOUND (if zero residual delta) or FAILED (if unhedged delta remains)
  let terminalState: ExecutionState = 'FAILED';
  if (unwindResult.success && unwindResult.unhedgedResidualDelta === 0) {
    terminalState = 'UNWOUND';
    recordTransition('UNWOUND', 'All filled inventory successfully liquidated/hedged');
  } else {
    recordTransition(
      'FAILED',
      `Unwind incomplete; unhedged delta of ${unwindResult.unhedgedResidualDelta} remains`,
    );
  }

  return {
    executionId: parsedOrder.orderId,
    opportunityId: parsedOrder.opportunityId,
    state: terminalState,
    stateHistory,
    legs: legResults,
    unwindResult,
    error: unwindResult.success
      ? undefined
      : `Unwind failed: ${unwindResult.error ?? 'unknown error'} (unhedged delta: ${unwindResult.unhedgedResidualDelta})`,
    latencyMs: Date.now() - startTime,
    timestamp: Date.now(),
  };
}
