/**
 * Batch execution loops (concurrent and sequential) for multi-leg arbitrage.
 *
 * @module desk/arbitrage/execution/multileg-batch-executor
 */

import { logger } from '../../../shared/utils/logger';
import type { ConnectorResolver } from '../compensatory-unwind-handler';
import type { LegOrderParams, LegExecutionReport } from '../execution-types';
import { executeSingleLegWithTimeout } from './multileg-single-leg-executor';

/**
 * Execute all leg orders concurrently in parallel.
 */
export async function executeConcurrentLegs(
  connectorResolver: ConnectorResolver,
  legs: LegOrderParams[],
  defaultTimeoutMs: number,
  abortSignal: AbortSignal,
): Promise<LegExecutionReport[]> {
  const promises = legs.map((leg) =>
    executeSingleLegWithTimeout(connectorResolver, leg, defaultTimeoutMs, abortSignal),
  );
  const settled = await Promise.allSettled(promises);

  const outRecords: LegExecutionReport[] = [];
  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    if (res.status === 'fulfilled') {
      outRecords.push(res.value);
    } else {
      const leg = legs[i];
      outRecords.push({
        legId: leg.legId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        remainingAmount: leg.amount,
        price: leg.price,
        status: 'failed',
        latencyMs: 0,
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      });
    }
  }
  return outRecords;
}

/**
 * Execute leg orders sequentially, halting on first failure.
 */
export async function executeSequentialLegs(
  connectorResolver: ConnectorResolver,
  legs: LegOrderParams[],
  defaultTimeoutMs: number,
  abortSignal: AbortSignal,
): Promise<LegExecutionReport[]> {
  const outRecords: LegExecutionReport[] = [];

  for (const leg of legs) {
    if (abortSignal.aborted) {
      outRecords.push({
        legId: leg.legId,
        venue: leg.venue,
        symbol: leg.symbol,
        side: leg.side,
        requestedAmount: leg.amount,
        filledAmount: 0,
        remainingAmount: leg.amount,
        price: leg.price,
        status: 'canceled',
        latencyMs: 0,
        error: 'Sequential execution aborted due to preceding leg failure',
      });
      break;
    }

    const record = await executeSingleLegWithTimeout(connectorResolver, leg, defaultTimeoutMs, abortSignal);
    outRecords.push(record);

    if (record.status !== 'filled' || record.remainingAmount > 0) {
      logger.warn('[AtomicMultiLegCoordinator] Staged leg did not fill 100%; halting subsequent legs', {
        legId: leg.legId,
        status: record.status,
        filled: record.filledAmount,
        requested: record.requestedAmount,
      });
      break;
    }
  }

  return outRecords;
}
