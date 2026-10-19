/**
 * Live Order Submission Helpers
 * Submits orders to Polymarket CLOB, tracks order state, and triggers fill or poll
 */

import type { PolymarketOrder } from './polymarket-signer';
import type { PolymarketOrderResponse } from './polymarket-adapter';
import type { OrderState, LiveOrderManagerCtx } from './live-order-manager-types';
import { requireLiveEnabled } from './execution-mode';

export interface SubmissionHost extends LiveOrderManagerCtx {
  handleFill(state: OrderState): void;
  schedulePoll(orderId: string): void;
}

/** Submit a signed order to CLOB and begin polling for fill status */
export async function submitAndTrackOrder(
  host: SubmissionHost,
  order: PolymarketOrder
): Promise<PolymarketOrderResponse> {
  if (host.stopped) throw new Error('LiveOrderManager is stopped');

  // Hard env gate: LIVE mode requires the operator to set LIVE_TRADING_ENABLED=true
  requireLiveEnabled('LiveOrderManager.submitAndTrack');

  const response = await host.adapter.placeOrder(order);

  const state: OrderState = {
    orderId: response.orderID,
    tokenId: order.tokenId,
    side: order.side,
    size: order.size,
    price: order.price,
    status: response.status === 'matched' ? 'matched' : 'pending',
    submittedAt: Date.now(),
    lastPollAt: Date.now(),
    pollAttempts: 0,
  };

  host.activeOrders.set(response.orderID, state);

  if (response.status === 'matched') {
    host.handleFill(state);
  } else {
    host.schedulePoll(response.orderID);
  }

  return response;
}

/** Submit order without tracking (fire-and-forget) */
export async function submitOnlyOrder(
  host: LiveOrderManagerCtx,
  order: PolymarketOrder
): Promise<PolymarketOrderResponse> {
  return host.adapter.placeOrder(order);
}
