/**
 * Live Order Submission Helpers
 * Submits orders to Polymarket CLOB, tracks order state, and triggers fill or poll
 */

import type { PolymarketOrder } from './polymarket-signer';
import type { PolymarketOrderResponse } from './polymarket-adapter';
import {
  computePendingRiskAdjustments,
  type OrderState,
  type LiveOrderManagerCtx,
} from './live-order-manager-types';
import { requireLiveEnabled } from './execution-mode';
import { validateSignalWithPolymarketV2Gate } from './polymarket-v2-pretrade-bridge';

export interface SubmissionHost extends LiveOrderManagerCtx {
  handleFill(state: OrderState): void;
  schedulePoll(orderId: string): void;
}

function assertPolymarketV2OrderAllowed(host: LiveOrderManagerCtx, order: PolymarketOrder): void {
  if (!host.polymarketV2Gate) return;
  const pending = computePendingRiskAdjustments(host.activeOrders, order.tokenId, order.side);
  const rawFreeBalanceUsd =
    typeof host.positionTracker?.getFreeBalanceUsd === 'function'
      ? Math.max(0, host.positionTracker.getFreeBalanceUsd() - pending.pendingFreeNotionalUsd)
      : undefined;
  const currentMarketExposureUsd =
    typeof host.positionTracker?.getTokenExposureUsd === 'function'
      ? host.positionTracker.getTokenExposureUsd(order.tokenId) + pending.pendingSameSideUsd
      : undefined;
  const isPositionReducing =
    typeof host.positionTracker?.isPositionReducingOrder === 'function'
      ? host.positionTracker.isPositionReducingOrder(
          order.tokenId,
          order.side,
          order.size + pending.pendingOppositeShares,
        )
      : false;
  const tickSizeMicro = host.getTickSizeMicro?.(order.tokenId);
  const riskCtx = host.getRiskContext?.(order.tokenId);

  const v2Result = validateSignalWithPolymarketV2Gate(
    host.polymarketV2Gate,
    {
      tokenId: order.tokenId,
      side: order.side,
      price: order.price,
      size: order.size,
      timestamp: Date.now(),
    },
    {
      rawFreeBalanceUsd,
      currentMarketExposureUsd,
      tickSizeMicro,
      isPositionReducing,
      currentVpin: riskCtx?.currentVpin,
      consecutiveBookErrors: riskCtx?.consecutiveBookErrors,
    },
  );
  if (!v2Result.allowed) {
    throw new Error(`RISK_GATE_REJECTED: ${v2Result.reason ?? 'POLYMARKET_V2_GATE_REJECTED'}`);
  }
}

async function resolveOrderWithFeeRate(
  host: LiveOrderManagerCtx,
  order: PolymarketOrder,
): Promise<PolymarketOrder> {
  if (order.feeRateBps > 0 || typeof host.adapter?.getFeeRate !== 'function') {
    return order;
  }
  try {
    const { feeRateBps } = await host.adapter.getFeeRate(order.tokenId);
    return feeRateBps > 0 ? { ...order, feeRateBps } : order;
  } catch {
    return order;
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

  const resolvedOrder = await resolveOrderWithFeeRate(host, order);
  const response = await host.adapter.placeOrder(resolvedOrder);
  if (!response?.orderID || response.orderID.trim().length === 0) {
    throw new Error('CLOB_ORDER_REJECTED: empty orderID in placeOrder response');
  }

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
  const resolvedOrder = await resolveOrderWithFeeRate(host, order);
  const response = await host.adapter.placeOrder(resolvedOrder);
  if (!response?.orderID || response.orderID.trim().length === 0) {
    throw new Error('CLOB_ORDER_REJECTED: empty orderID in placeOrder response');
  }
  return response;
}
