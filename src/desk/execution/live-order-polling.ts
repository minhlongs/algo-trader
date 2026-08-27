/**
 * Live Order Manager — Polling Helpers
 *
 * Extracted from live-order-manager.ts. Contains schedulePollFor and pollOrderFor
 * as pure functions operating on the structural LiveOrderManagerCtx.
 * Zero behavior change — identical logic, just standalone.
 */

import { logger } from '../../shared/utils/logger';
import type { LiveOrderManagerCtx, OrderState } from './live-order-manager-types';
import { DEFAULT_POLL_INTERVALS, MAX_POLL_ERRORS } from './live-order-manager-types';
import { handleFillFor, handleExpiredFor } from './live-order-manager-terminal';

/**
 * Schedule a poll for an order with exponential backoff.
 * If the order has exceeded max lifetime, handle expiration.
 */
export function schedulePollFor(ctx: LiveOrderManagerCtx, orderId: string): void {
  const state = ctx.activeOrders.get(orderId);
  if (!state || ctx.stopped) return;

  const age = Date.now() - state.submittedAt;
  if (age > ctx.maxOrderLifetimeMs) {
    handleExpiredFor(ctx, orderId);
    return;
  }

  const intervalIdx = Math.min(state.pollAttempts, DEFAULT_POLL_INTERVALS.length - 1);
  const delay = DEFAULT_POLL_INTERVALS[intervalIdx];

  const timer = setTimeout(() => pollOrderFor(ctx, orderId), delay);
  ctx.pollTimers.set(orderId, timer);
}

/**
 * Poll an order's status from the adapter.
 * Handles fill, cancel, expiration, and poll errors with max retries.
 */
export async function pollOrderFor(ctx: LiveOrderManagerCtx, orderId: string): Promise<void> {
  ctx.pollTimers.delete(orderId);

  const state = ctx.activeOrders.get(orderId);
  if (!state || ctx.stopped) return;

  state.pollAttempts++;
  state.lastPollAt = Date.now();

  try {
    const openOrders = await ctx.adapter.getOpenOrders();
    const order = openOrders.find((o) => o.id === orderId);

    if (!order) {
      // Order not in open orders — might be filled or expired on CLOB side
      // Check age to determine
      const age = Date.now() - state.submittedAt;
      if (age > ctx.maxOrderLifetimeMs) {
        handleExpiredFor(ctx, orderId);
      } else {
        // Still polling — might be a CLOB delay
        schedulePollFor(ctx, orderId);
      }
      return;
    }

    if (order.status === 'matched' || order.status === 'filled') {
      state.status = 'matched';
      handleFillFor(ctx, state);
    } else if (order.status === 'canceled') {
      state.status = 'canceled';
      ctx.activeOrders.delete(orderId);
      ctx.emit('canceled', orderId);
    } else {
      // Still unmatched or delayed — keep polling
      schedulePollFor(ctx, orderId);
    }
  } catch (err) {
    if (state.pollAttempts >= MAX_POLL_ERRORS) {
      state.status = 'error';
      ctx.activeOrders.delete(orderId);
      ctx.emit('error', orderId, err as Error);
      logger.error(`Order ${orderId} exceeded max poll errors`, 'LiveOrderManager', {
        err: String(err),
      });
    } else {
      schedulePollFor(ctx, orderId);
    }
  }
}