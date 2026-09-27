/**
 * Single-leg execution logic with retry backoff and emergency liquidation.
 *
 * @module desk/arbitrage/execution/compensatory-unwind-leg
 */

import { logger } from '../../../shared/utils/logger';
import type { EventEmitter } from 'node:events';
import type { IExchangeConnector } from '../connectors/types';
import type { UnwindLegTarget, LegExecutionReport, LegSide } from './execution-types-reports';
import type { UnwindHandlerConfig } from './compensatory-unwind-types';
import {
  calculateUnwindLoss,
  buildUnwindSuccessReport,
  handleMissingConnector,
} from './compensatory-unwind-order';

export interface UnwindLegContext {
  emitter: EventEmitter;
  config: Required<UnwindHandlerConfig>;
  connectorResolver: (venue: string) => IExchangeConnector | undefined;
  unwindId: string;
  executionId: string;
  startTime: number;
}

export interface LegUnwindOutcome {
  unwoundLegs: LegExecutionReport[];
  realizedLossUsd: number;
  residualDelta: number;
  attempts: number;
  error?: string;
}

export async function executeSingleLegUnwind(
  target: UnwindLegTarget,
  ctx: UnwindLegContext,
  maxRetries: number,
): Promise<LegUnwindOutcome> {
  const { emitter, config, connectorResolver, unwindId, executionId, startTime } = ctx;
  const connector = connectorResolver(target.venue);
  if (!connector) {
    const res = handleMissingConnector(target, unwindId, executionId, startTime, emitter);
    return { unwoundLegs: res.unwoundLegs, realizedLossUsd: 0, residualDelta: res.residualDelta, attempts: 0, error: res.error };
  }

  const unwoundLegs: LegExecutionReport[] = [];
  const unwindSide: LegSide = target.side === 'buy' ? 'sell' : 'buy';
  let totalRealizedLossUsd = 0;
  let remainingToUnwind = target.filledAmount;
  let legFilled = 0;
  let legAttempts = 0;
  let legSuccess = false;
  let backoffMs = config.initialBackoffMs;
  let lastError: string | undefined;

  while (legAttempts <= maxRetries && remainingToUnwind > 0) {
    legAttempts++;
    const legStart = Date.now();
    const isEmergency = legAttempts > maxRetries && config.emergencyFallback;
    const clientOrderId = isEmergency
      ? `emergency-unwind-${unwindId}-${target.legId}-${legAttempts}`
      : `unwind-${unwindId}-${target.legId}-${legAttempts}`;

    try {
      if (legAttempts > 1) {
        logger.warn('[CompensatoryUnwindHandler] Retrying compensatory unwind with backoff', { unwindId, legId: target.legId, attempt: legAttempts, backoffMs });
        emitter.emit('unwind:retry', { unwindId, executionId, legId: target.legId, venue: target.venue, symbol: target.symbol, side: unwindSide, amount: remainingToUnwind, attempt: legAttempts });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs *= config.backoffMultiplier;
      }

      const orderResult = await connector.placeOrder({
        symbol: target.symbol,
        side: unwindSide,
        type: 'market',
        amount: remainingToUnwind,
        clientOrderId,
      });

      const fillAmount = orderResult.filled > 0 ? orderResult.filled : (orderResult.status === 'closed' ? remainingToUnwind : 0);
      legFilled += fillAmount;
      remainingToUnwind = Math.max(0, remainingToUnwind - fillAmount);

      const execPrice = orderResult.price > 0 ? orderResult.price : target.entryPrice;
      const feeUsd = orderResult.fee ? (orderResult.fee.amount ?? 0) : 0;
      totalRealizedLossUsd += calculateUnwindLoss(target.side, target.entryPrice, execPrice, fillAmount, feeUsd);

      unwoundLegs.push(buildUnwindSuccessReport({
        legId: target.legId,
        orderId: orderResult.orderId,
        clientOrderId,
        venue: target.venue,
        symbol: target.symbol,
        unwindSide,
        requestedAmount: target.filledAmount,
        filledAmount: legFilled,
        remainingAmount: remainingToUnwind,
        execPrice,
        fee: orderResult.fee,
        latencyMs: Date.now() - legStart,
      }));

      if (remainingToUnwind === 0) {
        legSuccess = true;
        logger.info('[CompensatoryUnwindHandler] Unwind leg closed successfully', { unwindId, legId: target.legId, unwoundAmount: legFilled });
        emitter.emit('unwind:success', { unwindId, executionId, legId: target.legId, venue: target.venue, symbol: target.symbol, side: unwindSide, amount: legFilled, latencyMs: Date.now() - legStart });
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn('[CompensatoryUnwindHandler] Unwind attempt failed', { unwindId, legId: target.legId, attempt: legAttempts, error: lastError });
    }
  }

  if (!legSuccess && remainingToUnwind > 0) {
    logger.error('[CompensatoryUnwindHandler] Unwind exhausted retries', { unwindId, legId: target.legId, residualDelta: remainingToUnwind, error: lastError });
    emitter.emit('unwind:escalated', { unwindId, executionId, legId: target.legId, venue: target.venue, symbol: target.symbol, side: unwindSide, amount: remainingToUnwind, error: lastError });
  }

  return { unwoundLegs, realizedLossUsd: totalRealizedLossUsd, residualDelta: remainingToUnwind, attempts: legAttempts, error: lastError };
}
