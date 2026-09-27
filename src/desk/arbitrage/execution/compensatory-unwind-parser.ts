/**
 * Request normalization and result building for compensatory unwind operations.
 *
 * @module desk/arbitrage/execution/compensatory-unwind-parser
 */

import {
  type CompensatoryUnwindRequest,
  type UnwindLegTarget,
  type LegExecutionReport,
  type UnwindResult,
  CompensatoryUnwindRequestSchema,
  UnwindResultSchema,
} from './execution-types-reports';

export function normalizeUnwindRequest(
  requestOrExecutionId: CompensatoryUnwindRequest | string,
  legacyLegs?: Array<LegExecutionReport | UnwindLegTarget>,
  legacyReason?: string,
  defaultMaxRetries = 3,
): CompensatoryUnwindRequest {
  let request: CompensatoryUnwindRequest;

  if (typeof requestOrExecutionId === 'string') {
    const targets: UnwindLegTarget[] = [];
    for (const leg of legacyLegs ?? []) {
      if (leg.filledAmount > 0) {
        targets.push({
          legId: leg.legId,
          venue: leg.venue,
          symbol: leg.symbol,
          side: leg.side,
          filledAmount: leg.filledAmount,
          entryPrice: 'avgFillPrice' in leg && leg.avgFillPrice ? leg.avgFillPrice : ('entryPrice' in leg ? leg.entryPrice : leg.price),
          orderId: leg.orderId,
        });
      }
    }

    request = {
      unwindId: `unwind-${requestOrExecutionId}-${Date.now()}`,
      executionId: requestOrExecutionId,
      legsToUnwind: targets,
      reason: legacyReason ?? 'Compensatory unwind triggered',
      maxRetries: defaultMaxRetries,
    };
  } else {
    request = requestOrExecutionId;
    if (!request.unwindId) {
      request.unwindId = `unwind-${request.executionId}-${Date.now()}`;
    }
  }

  CompensatoryUnwindRequestSchema.parse(request);
  return request;
}

export function buildUnwindResult(params: {
  unwindId: string;
  unwoundLegs: LegExecutionReport[];
  unhedgedResidualDelta: number;
  totalRealizedLossUsd: number;
  totalAttempts: number;
  lastError?: string;
}): UnwindResult {
  const overallSuccess = params.unhedgedResidualDelta === 0;

  const result: UnwindResult = {
    unwindId: params.unwindId,
    success: overallSuccess,
    unwoundLegs: params.unwoundLegs,
    unhedgedResidualDelta: params.unhedgedResidualDelta,
    totalRealizedLossUsd: Number(params.totalRealizedLossUsd.toFixed(4)),
    unwindCostUsd: Number(params.totalRealizedLossUsd.toFixed(4)),
    attempts: params.totalAttempts,
    error: overallSuccess ? undefined : (params.lastError ?? 'Residual unhedged delta remains'),
    timestamp: Date.now(),
  };

  UnwindResultSchema.parse(result);
  return result;
}
