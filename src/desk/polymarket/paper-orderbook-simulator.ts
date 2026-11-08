/**
 * Orderbook-Backed Paper Fill Simulator & Leg-2 Decay Tracker (G2-Poly-Shadow)
 *
 * Sweeps real CLOB orderbook depth (bids/asks) in PAPER mode to compute
 * realistic VWAP fill prices, partial fills, rejections, dynamic taker fees,
 * and Leg-1 -> Leg-2 execution decay statistics.
 */

import type { PolymarketOrder } from '../execution/polymarket-signer';
import type { PolymarketOrderBook } from '../execution/polymarket-adapter';
import type { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import type { LivePositionTracker, FilledOrder } from '../execution/live-position-tracker';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import { calcQuadraticTakerFeeRateV2, type PolymarketCategory } from './polymarket-fee-calculator';

export type PaperOrderBookProvider = (
  tokenId: string,
) => Promise<{ bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> } | PolymarketOrderBook>;

export interface PaperSweepOutcome {
  status: 'matched' | 'unmatched';
  lifecycleType: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED';
  requestedSize: number;
  limitPrice: number;
  filledSize: number;
  avgFillPrice: number;
  feeUsdc: number;
  partial: boolean;
}

export interface Leg2DecayStats {
  leg1Fills: number;
  leg2Attempts: number;
  leg2FullFills: number;
  leg2PartialFills: number;
  leg2Rejects: number;
  leg2FillDecayRatio: number;
}

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

export function sweepOrderBookLevels(
  book: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> } | null,
  side: 'BUY' | 'SELL',
  requestedSize: number,
  limitPrice: number,
  category: PolymarketCategory = 'politics',
): PaperSweepOutcome {
  if (!book) {
    const feeUsdc = calcQuadraticTakerFeeRateV2(category, limitPrice) * requestedSize * limitPrice;
    return {
      status: 'matched', lifecycleType: 'FILLED', requestedSize, limitPrice,
      filledSize: requestedSize, avgFillPrice: limitPrice, feeUsdc, partial: false,
    };
  }

  const rawLevels = side === 'BUY' ? (book.asks ?? []) : (book.bids ?? []);
  const parsed = rawLevels
    .map((lvl) => ({ price: parseFloat(lvl.price), size: parseFloat(lvl.size) }))
    .filter((lvl) => Number.isFinite(lvl.price) && Number.isFinite(lvl.size) && lvl.size > 0)
    .sort((a, b) => (side === 'BUY' ? a.price - b.price : b.price - a.price));

  let remaining = requestedSize;
  let filledSize = 0;
  let totalNotional = 0;

  for (const lvl of parsed) {
    const crosses = side === 'BUY' ? lvl.price <= limitPrice + 1e-9 : lvl.price >= limitPrice - 1e-9;
    if (!crosses) break;
    const take = Math.min(remaining, lvl.size);
    if (take <= 0) continue;
    filledSize += take;
    totalNotional += take * lvl.price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }

  if (filledSize <= 1e-9) {
    return {
      status: 'unmatched', lifecycleType: 'REJECTED', requestedSize, limitPrice,
      filledSize: 0, avgFillPrice: 0, feeUsdc: 0, partial: false,
    };
  }

  const avgFillPrice = totalNotional / filledSize;
  const feeUsdc = calcQuadraticTakerFeeRateV2(category, avgFillPrice) * filledSize * avgFillPrice;
  const partial = filledSize < requestedSize - 1e-9;

  return {
    status: 'matched', lifecycleType: partial ? 'PARTIALLY_FILLED' : 'FILLED',
    requestedSize, limitPrice, filledSize, avgFillPrice, feeUsdc, partial,
  };
}

export class PaperLegDecayTracker {
  private lastLeg1AtMs = 0;
  private lastLeg1TokenId = '';
  private leg1Fills = 0;
  private leg2Attempts = 0;
  private leg2FullFills = 0;
  private leg2PartialFills = 0;
  private leg2Rejects = 0;

  recordOrderOutcome(tokenId: string, side: 'BUY' | 'SELL', outcome: PaperSweepOutcome, nowMs = Date.now()): void {
    if (side !== 'BUY') return;
    const isPairedSecondLeg =
      this.lastLeg1AtMs > 0 && nowMs - this.lastLeg1AtMs <= 2000 &&
      this.lastLeg1TokenId !== '' && this.lastLeg1TokenId !== tokenId;

    if (isPairedSecondLeg) {
      this.leg2Attempts++;
      if (outcome.lifecycleType === 'FILLED') this.leg2FullFills++;
      else if (outcome.lifecycleType === 'PARTIALLY_FILLED') this.leg2PartialFills++;
      else this.leg2Rejects++;
      this.lastLeg1AtMs = 0;
      this.lastLeg1TokenId = '';
      return;
    }

    if (outcome.filledSize > 0) {
      this.leg1Fills++;
      this.lastLeg1AtMs = nowMs;
      this.lastLeg1TokenId = tokenId;
    }
  }

  getStats(): Leg2DecayStats {
    const failedOrPartial = this.leg2PartialFills + this.leg2Rejects;
    const leg2FillDecayRatio = this.leg2Attempts > 0 ? failedOrPartial / this.leg2Attempts : 0;
    return {
      leg1Fills: this.leg1Fills, leg2Attempts: this.leg2Attempts, leg2FullFills: this.leg2FullFills,
      leg2PartialFills: this.leg2PartialFills, leg2Rejects: this.leg2Rejects, leg2FillDecayRatio,
    };
  }
}

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
    orderId, tokenId: order.tokenId, side, price: outcome.avgFillPrice, size: outcome.filledSize, filledAt: ts,
  };
  positionTracker.recordFill(fillRecord);
  journal.recordFill(fillRecord);
}
