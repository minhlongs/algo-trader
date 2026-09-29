/**
 * Single-leg execution with timeout and cancellation for multi-leg arbitrage.
 *
 * @module desk/arbitrage/execution/multileg-single-leg-executor
 */

import { logger } from '../../../shared/utils/logger';
import type { ConnectorResolver } from '../compensatory-unwind-handler';
import type { LegOrderParams, LegExecutionReport } from '../execution-types';

/**
 * Execute a single leg order against a connector with timeout handling.
 */
export async function executeSingleLegWithTimeout(
  connectorResolver: ConnectorResolver,
  leg: LegOrderParams,
  defaultTimeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<LegExecutionReport> {
  const timeoutMs = leg.timeoutMs ?? defaultTimeoutMs;
  const start = Date.now();

  if (abortSignal?.aborted) {
    return {
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
      error: 'Aborted prior to submission',
    };
  }

  const connector = connectorResolver(leg.venue);
  if (!connector) {
    return {
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
      error: `No connector found for venue "${leg.venue}"`,
    };
  }

  const clientOrderId = leg.clientOrderId ?? `${leg.legId}-${Date.now()}`;
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`LEG_TIMEOUT: Leg ${leg.legId} on venue ${leg.venue} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const orderPromise = connector.placeOrder({
      symbol: leg.symbol,
      side: leg.side,
      type: leg.type,
      amount: leg.amount,
      price: leg.type === 'limit' ? leg.price : undefined,
      clientOrderId,
    });

    const orderResult = await Promise.race([orderPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);

    const fillAmount =
      orderResult.filled > 0 ? orderResult.filled : (orderResult.status === 'closed' ? leg.amount : 0);
    const remainingAmount = Math.max(0, leg.amount - fillAmount);
    const isFilled = remainingAmount === 0 || orderResult.status === 'closed';

    return {
      legId: leg.legId,
      orderId: orderResult.orderId,
      clientOrderId: orderResult.clientOrderId ?? clientOrderId,
      venue: leg.venue,
      symbol: leg.symbol,
      side: leg.side,
      requestedAmount: leg.amount,
      filledAmount: fillAmount,
      remainingAmount,
      price: orderResult.price > 0 ? orderResult.price : leg.price,
      avgFillPrice: orderResult.price > 0 ? orderResult.price : leg.price,
      status: isFilled ? 'filled' : (fillAmount > 0 ? 'partial' : 'failed'),
      fee: orderResult.fee,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = errMsg.includes('LEG_TIMEOUT');

    return {
      legId: leg.legId,
      clientOrderId,
      venue: leg.venue,
      symbol: leg.symbol,
      side: leg.side,
      requestedAmount: leg.amount,
      filledAmount: 0,
      remainingAmount: leg.amount,
      price: leg.price,
      status: isTimeout ? 'timed_out' : 'failed',
      latencyMs: Date.now() - start,
      error: errMsg,
    };
  }
}

/**
 * Cancel open/pending orders for legs during unwind.
 */
export async function cancelOpenLegs(
  connectorResolver: ConnectorResolver,
  legs: LegExecutionReport[],
): Promise<void> {
  const cancelPromises: Promise<boolean>[] = [];

  for (const leg of legs) {
    if (leg.orderId && (leg.status === 'partial' || leg.status === 'submitted' || leg.status === 'pending')) {
      const connector = connectorResolver(leg.venue);
      if (connector) {
        logger.info('[AtomicMultiLegCoordinator] Canceling open leg during unwind', {
          venue: leg.venue,
          orderId: leg.orderId,
          symbol: leg.symbol,
        });

        cancelPromises.push(
          connector.cancelOrder(leg.orderId, leg.symbol).catch((err) => {
            logger.warn('[AtomicMultiLegCoordinator] Failed to cancel open order', {
              venue: leg.venue,
              orderId: leg.orderId,
              error: err instanceof Error ? err.message : String(err),
            });
            return false;
          }),
        );
      }
    }
  }

  if (cancelPromises.length > 0) {
    await Promise.allSettled(cancelPromises);
  }
}
