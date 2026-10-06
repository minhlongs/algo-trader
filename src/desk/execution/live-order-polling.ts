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

async function checkFillAndReconcile(
  ctx: LiveOrderManagerCtx,
  orderId: string,
  state: OrderState
): Promise<boolean> {
  try {
    const adapter = ctx.adapter as unknown as {
      getOrder?: (id: string) => Promise<{
        status?: string;
        size_matched?: string | number;
        filled?: number;
      } | null>;
    };
    if (typeof adapter.getOrder === 'function') {
      const orderInfo = await adapter.getOrder(orderId);
      if (orderInfo) {
        const status = orderInfo.status?.toLowerCase();
        const matched = typeof orderInfo.size_matched === 'number'
          ? orderInfo.size_matched
          : typeof orderInfo.size_matched === 'string'
            ? parseFloat(orderInfo.size_matched)
            : (orderInfo.filled ?? 0);

        if (status === 'matched' || status === 'filled' || (!isNaN(matched) && matched > 0)) {
          if (!isNaN(matched) && matched > 0) {
            state.size = matched;
          }
          state.status = 'matched';
          handleFillFor(ctx, state);
          return true;
        }
      }
    }
  } catch (err) {
    logger.warn(`Failed to interrogate fill status for ${orderId}: ${String(err)}`, 'LiveOrderManager');
  }
  return false;
}

/**
 * Schedule a poll for an order with exponential backoff.
 * If the order has exceeded max lifetime, handle expiration.
 */
export function schedulePollFor(ctx: LiveOrderManagerCtx, orderId: string): void {
  const state = ctx.activeOrders.get(orderId);
  if (!state || ctx.stopped) return;

  const age = Date.now() - state.submittedAt;
  if (age > ctx.maxOrderLifetimeMs) {
    const adapter = ctx.adapter as unknown as { getOrder?: unknown };
    if (typeof adapter?.getOrder === 'function') {
      void (async () => {
        const reconciled = await checkFillAndReconcile(ctx, orderId, state);
        if (!reconciled && ctx.activeOrders.has(orderId) && !ctx.stopped) {
          handleExpiredFor(ctx, orderId);
        }
      })();
    } else {
      handleExpiredFor(ctx, orderId);
    }
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
        const reconciled = await checkFillAndReconcile(ctx, orderId, state);
        if (!reconciled) {
          handleExpiredFor(ctx, orderId);
        }
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