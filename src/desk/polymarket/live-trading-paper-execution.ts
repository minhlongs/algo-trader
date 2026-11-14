/**
 * Live Trading Orchestrator — Paper Order Placement & Cancel Lifecycle
 *
 * Executes paper-mode orderbook sweeps with per-token fee schedule resolution,
 * microstructure snapshot/error tracking, reconciler journaling, and G2 shadow telemetry.
 */

import type { PolymarketOrderResponse } from '../execution/polymarket-adapter';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import type { LivePositionTracker } from '../execution/live-position-tracker';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import type { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import {
  DEFAULT_PAPER_FEE_SCHEDULE,
  extractPaperOrderParams,
  sweepOrderBookLevels,
  applyPaperOrderOutcome,
  type PaperLegDecayTracker,
  type PaperOrderBookProvider,
} from './paper-orderbook-simulator';
import { EXEMPT_FEE_SCHEDULE, type PolymarketFeeSchedule } from './polymarket-fee-calculator';
import type { FeeScheduleResolver } from './fee-schedule-resolver';
import type { PolymarketMicrostructureTracker } from './polymarket-microstructure-tracker';
import { saveReconcilerState, appendG2ShadowTelemetry } from './g2-shadow-telemetry';

async function resolvePaperFeeSchedule(
  resolver: FeeScheduleResolver | null | undefined,
  tokenId: string,
): Promise<PolymarketFeeSchedule> {
  if (!resolver) return DEFAULT_PAPER_FEE_SCHEDULE;
  const resolved = await resolver.resolve(tokenId);
  return resolved ?? EXEMPT_FEE_SCHEDULE;
}

export async function executePaperOrderPlacement(params: {
  reconciler: PolymarketOrderReconciler;
  positionTracker: LivePositionTracker;
  journal: LiveTradingJournal;
  legDecayTracker: PaperLegDecayTracker;
  microstructureTracker?: PolymarketMicrostructureTracker;
  orderBookProvider: PaperOrderBookProvider | null;
  /** Resolves the market's own schedule by token id. Absent => the paper default. */
  feeScheduleResolver?: FeeScheduleResolver | null;
  startedAtMs: number;
  order: PolymarketOrder;
  orderId: string;
}): Promise<PolymarketOrderResponse> {
  const { side, requestedSize, limitPrice } = extractPaperOrderParams(params.order);
  let book: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> } | null = null;
  if (params.orderBookProvider) {
    try {
      book = await params.orderBookProvider(params.order.tokenId);
      params.microstructureTracker?.recordOrderBookSnapshot(params.order.tokenId, book);
    } catch {
      params.microstructureTracker?.recordBookError(params.order.tokenId);
      book = { bids: [], asks: [] };
    }
  }
  const schedule = await resolvePaperFeeSchedule(params.feeScheduleResolver, params.order.tokenId);
  const outcome = sweepOrderBookLevels({
    book,
    side,
    requestedSize,
    limitPrice,
    schedule,
    orderType: params.order.orderType,
  });
  params.legDecayTracker.recordOrderOutcome(params.order.tokenId, side, outcome);
  applyPaperOrderOutcome({
    reconciler: params.reconciler,
    positionTracker: params.positionTracker,
    journal: params.journal,
    order: params.order,
    orderId: params.orderId,
    side,
    outcome,
  });
  const loopStartedAt = params.startedAtMs > 0 ? params.startedAtMs : Date.now();
  const decayStats = params.legDecayTracker.getStats();
  saveReconcilerState(params.reconciler, loopStartedAt, decayStats);
  appendG2ShadowTelemetry({
    loopStartedAtMs: loopStartedAt,
    mode: 'PAPER',
    event: 'fill',
    positionSummary: params.positionTracker.getSummary(),
    reconciliationSummary: params.reconciler.reconcile(),
    leg2DecayStats: decayStats,
  });
  return {
    orderID: params.orderId,
    status: outcome.status,
    filledSize: outcome.filledSize,
    fillPrice: outcome.avgFillPrice,
    feeUsdc: outcome.feeUsdc,
    partial: outcome.partial,
  };
}

export function recordPaperOrderCancel(reconciler: PolymarketOrderReconciler, orderId: string): void {
  if (reconciler.getOrder(orderId)) {
    reconciler.applyEvent({
      eventId: `${orderId}:cancel:${Date.now()}`,
      orderId,
      type: 'CANCELLED',
      timestamp: Date.now(),
    });
  }
}
