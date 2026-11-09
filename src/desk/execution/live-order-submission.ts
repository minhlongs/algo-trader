/**
 * Live Order Submission Helpers
 * Submits orders to Polymarket CLOB, tracks order state, and triggers fill or poll
 */

import type { PolymarketOrder } from './polymarket-signer';
import type { PolymarketOrderResponse } from './polymarket-adapter';
import type { OrderState, LiveOrderManagerCtx } from './live-order-manager-types';
import { requireLiveEnabled } from './execution-mode';
import { validateSignalWithPolymarketV2Gate } from './polymarket-v2-pretrade-bridge';

export interface SubmissionHost extends LiveOrderManagerCtx {
  handleFill(state: OrderState): void;
  schedulePoll(orderId: string): void;
}

function assertPolymarketV2OrderAllowed(host: LiveOrderManagerCtx, order: PolymarketOrder): void {
  if (!host.polymarketV2Gate) return;
  const v2Result = validateSignalWithPolymarketV2Gate(host.polymarketV2Gate, {
    tokenId: order.tokenId,
    side: order.side,
    price: order.price,
    size: order.size,
    timestamp: Date.now(),
  });
  if (!v2Result.allowed) {
    throw new Error(`RISK_GATE_REJECTED: ${v2Result.reason ?? 'POLYMARKET_V2_GATE_REJECTED'}`);
  }
}

/** Submit a signed order to CLOB and begin polling for fill status */
export async function submitAndTrackOrder(
  host: SubmissionHost,
  order: PolymarketOrder
): Promise<PolymarketOrderResponse> {
  if (host.stopped) throw new Error('LiveOrderManager is stopped');
  assertPolymarketV2OrderAllowed(host, order);

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
  if (host.stopped) throw new Error('LiveOrderManager is stopped');
  assertPolymarketV2OrderAllowed(host, order);
  requireLiveEnabled('LiveOrderManager.submitOnly');
  return host.adapter.placeOrder(order);
}
