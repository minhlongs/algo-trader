/**
 * Live Order Manager — Terminal State Handlers
 *
 * Extracted from live-order-manager.ts. Contains handleFillFor and handleExpiredFor
 * as pure functions operating on the structural LiveOrderManagerCtx.
 * Zero behavior change — identical logic, just standalone.
 */

import { logger } from '../../shared/utils/logger';
import type { LiveOrderManagerCtx, OrderState } from './live-order-manager-types';
import type { FilledOrder } from './live-position-tracker';

/**
 * Handle a filled order: record in position tracker, remove from active, emit event.
 */
export function handleFillFor(ctx: LiveOrderManagerCtx, state: OrderState): void {
  ctx.pollTimers.delete(state.orderId);
  const fill: FilledOrder = {
    tokenId: state.tokenId,
    side: state.side,
    size: state.size,
    price: state.price,
    filledAt: Date.now(),
    orderId: state.orderId,
  };
  ctx.positionTracker.recordFill(fill);
  ctx.activeOrders.delete(state.orderId);
  ctx.emit('filled', state);
  logger.info(`Order ${state.orderId} filled`, 'LiveOrderManager', {
    tokenId: state.tokenId.slice(0, 12),
    side: state.side,
    size: state.size,
    price: state.price,
  });
}

/**
 * Handle an expired order: remove from active, emit event, best-effort cancel on CLOB.
 */
export function handleExpiredFor(ctx: LiveOrderManagerCtx, orderId: string): void {
  ctx.pollTimers.delete(orderId);
  const state = ctx.activeOrders.get(orderId);
  if (state) {
    state.status = 'expired';
    ctx.emit('expired', orderId);
  }
  ctx.activeOrders.delete(orderId);

  // Best-effort cancel on CLOB side
  ctx.adapter.cancelOrder(orderId).catch(() => {});
  logger.info(`Order ${orderId} expired`, 'LiveOrderManager');
}