/**
 * Paper Order Application — from a fill outcome to the ledger
 *
 * A paper fill only becomes a measurement once the reconciler has seen it and
 * the position tracker and journal have recorded it. This module owns that
 * hand-off, so the sweep (which decides how much filled) and the ledger (which
 * decides what that costs) stay separable and testable on their own.
 */

import type { PolymarketOrder } from '../execution/polymarket-signer';
import type { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import type { LivePositionTracker, FilledOrder } from '../execution/live-position-tracker';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import type { PaperSweepOutcome } from './paper-fill-sweep';

/** Normalises the several order shapes the strategies emit into sweep inputs. */
export function extractPaperOrderParams(order: PolymarketOrder): {
  side: 'BUY' | 'SELL';
  requestedSize: number;
  limitPrice: number;
} {
  const raw = order as unknown as Record<string, unknown>;
  const side: 'BUY' | 'SELL' = order.side === 'SELL' || Number(raw['side']) === 1 ? 'SELL' : 'BUY';
  const requestedSize =
    Number(order.size) > 0 ? Number(order.size) : Number(raw['makerAmount'] ?? 0) / 1e6 || 1;
  const limitPrice = Number(order.price) > 0 ? Number(order.price) : 0.5;
  return { side, requestedSize, limitPrice };
}

/** Drives the order lifecycle and, when something filled, the position and journal. */
export function applyPaperOrderOutcome(params: {
  reconciler: PolymarketOrderReconciler;
  positionTracker: LivePositionTracker;
  journal: LiveTradingJournal;
  order: PolymarketOrder;
  orderId: string;
  side: 'BUY' | 'SELL';
  outcome: PaperSweepOutcome;
  timestamp?: number;
}): void {
  const ts = params.timestamp ?? Date.now();
  const { reconciler, positionTracker, journal, order, orderId, side, outcome } = params;
  reconciler.createOrder({
    intentId: orderId, orderId, marketId: order.tokenId, tokenId: order.tokenId,
    side, requestedSize: outcome.requestedSize, limitPrice: outcome.limitPrice, timestamp: ts,
  });
  reconciler.applyEvent({ eventId: `${orderId}:submitted`, orderId, type: 'SUBMITTED', timestamp: ts });
  reconciler.applyEvent({ eventId: `${orderId}:ack`, orderId, type: 'ACKNOWLEDGED', timestamp: ts });

  if (outcome.lifecycleType === 'REJECTED' || outcome.filledSize <= 0) {
    reconciler.applyEvent({ eventId: `${orderId}:rejected`, orderId, type: 'REJECTED', timestamp: ts });
    return;
  }

  reconciler.applyEvent({
    eventId: `${orderId}:${outcome.lifecycleType.toLowerCase()}`,
    orderId, type: outcome.lifecycleType, fillSize: outcome.filledSize,
    fillPrice: outcome.avgFillPrice, feeUsdc: outcome.feeUsdc, timestamp: ts,
  });

  const fillRecord: FilledOrder = {
    orderId, tokenId: order.tokenId, side, price: outcome.avgFillPrice,
    size: outcome.filledSize, filledAt: ts,
  };
  positionTracker.recordFill(fillRecord);
  journal.recordFill(fillRecord);
}
