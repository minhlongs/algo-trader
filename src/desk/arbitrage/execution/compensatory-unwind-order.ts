/**
 * Order loss calculation and report building for compensatory unwinds.
 *
 * @module desk/arbitrage/execution/compensatory-unwind-order
 */

import { logger } from '../../../shared/utils/logger';
import type { EventEmitter } from 'node:events';
import type { LegExecutionReport, LegSide, UnwindLegTarget } from './execution-types-reports';

export function calculateUnwindLoss(
  originalSide: LegSide,
  entryPrice: number,
  execPrice: number,
  fillAmount: number,
  feeUsd = 0,
): number {
  if (originalSide === 'buy') {
    return Math.max(0, (entryPrice - execPrice) * fillAmount) + feeUsd;
  }
  return Math.max(0, (execPrice - entryPrice) * fillAmount) + feeUsd;
}

export function buildUnwindFailureReport(params: {
  legId: string;
  venue: string;
  symbol: string;
  side: LegSide;
  amount: number;
  entryPrice: number;
  latencyMs: number;
  error: string;
}): LegExecutionReport {
  return {
    legId: `unwind-${params.legId}`,
    venue: params.venue,
    symbol: params.symbol,
    side: params.side === 'buy' ? 'sell' : 'buy',
    requestedAmount: params.amount,
    filledAmount: 0,
    remainingAmount: params.amount,
    price: params.entryPrice,
    status: 'failed',
    latencyMs: params.latencyMs,
    error: params.error,
  };
}

export function buildUnwindSuccessReport(params: {
  legId: string;
  orderId?: string;
  clientOrderId?: string;
  venue: string;
  symbol: string;
  unwindSide: LegSide;
  requestedAmount: number;
  filledAmount: number;
  remainingAmount: number;
  execPrice: number;
  fee?: { currency?: string; cost?: number; amount?: number };
  latencyMs: number;
}): LegExecutionReport {
  return {
    legId: `unwind-${params.legId}`,
    orderId: params.orderId,
    clientOrderId: params.clientOrderId,
    venue: params.venue,
    symbol: params.symbol,
    side: params.unwindSide,
    requestedAmount: params.requestedAmount,
    filledAmount: params.filledAmount,
    remainingAmount: params.remainingAmount,
    price: params.execPrice,
    avgFillPrice: params.execPrice,
    status: params.remainingAmount === 0 ? 'filled' : 'partial',
    fee: params.fee
      ? {
          amount: params.fee.amount ?? params.fee.cost ?? 0,
          currency: params.fee.currency ?? 'USD',
        }
      : undefined,
    latencyMs: params.latencyMs,
  };
}

export function handleMissingConnector(
  target: UnwindLegTarget,
  unwindId: string,
  executionId: string,
  startTime: number,
  emitter: EventEmitter,
): { unwoundLegs: LegExecutionReport[]; residualDelta: number; error: string } {
  const errorMsg = `No connector registered for venue "${target.venue}"`;
  logger.error('[CompensatoryUnwindHandler] Connector missing for unwind target', {
    unwindId,
    venue: target.venue,
    legId: target.legId,
  });

  const failureReport = buildUnwindFailureReport({
    legId: target.legId,
    venue: target.venue,
    symbol: target.symbol,
    side: target.side,
    amount: target.filledAmount,
    entryPrice: target.entryPrice,
    latencyMs: Date.now() - startTime,
    error: errorMsg,
  });

  emitter.emit('unwind:failed', {
    unwindId,
    executionId,
    legId: target.legId,
    venue: target.venue,
    symbol: target.symbol,
    side: target.side === 'buy' ? 'sell' : 'buy',
    amount: target.filledAmount,
    error: errorMsg,
  });

  return { unwoundLegs: [failureReport], residualDelta: target.filledAmount, error: errorMsg };
}
