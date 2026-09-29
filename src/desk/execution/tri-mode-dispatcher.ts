/**
 * Tri-Mode Order Dispatcher (Milestone 3 - R3)
 * Isolates PAPER, SHADOW, and LIVE execution with slicing and slippage metrics.
 */

import { logger } from '../../shared/utils/logger';
import type { LiveExecutionGuard } from './live-execution-guard';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { DispatchResult, OrderSlice, TriMode } from './tri-mode-types';

export class TriModeDispatcher {
  private mode: TriMode;
  private liveApiCallsCount = 0;
  private virtualFillsCount = 0;
  private readonly liveGuard?: LiveExecutionGuard;

  constructor(initialMode: TriMode = 'PAPER', liveGuard?: LiveExecutionGuard) {
    this.mode = initialMode;
    this.liveGuard = liveGuard;
  }

  public setMode(mode: TriMode): void {
    logger.info(`[TriModeDispatcher] Switched execution mode: ${this.mode} -> ${mode}`);
    this.mode = mode;
  }

  public getMode(): TriMode { return this.mode; }
  public getLiveApiCallsCount(): number { return this.liveApiCallsCount; }
  public getVirtualFillsCount(): number { return this.virtualFillsCount; }

  public dispatch(
    intent: UnifiedTradeIntent,
    priceOverride?: number,
    partialFillRatio = 1.0
  ): DispatchResult {
    const executedQty = intent.quantity * Math.min(1.0, Math.max(0.0, partialFillRatio));
    const arrivalPrice = priceOverride ?? intent.price ?? 65000;
    const startMs = Date.now();

    if (executedQty === 0) {
      return {
        orderId: `ord-rej-${Date.now()}`,
        intentId: intent.intentId,
        mode: this.mode,
        venue: intent.venue,
        status: 'REJECTED',
        executedQuantity: 0,
        averagePrice: arrivalPrice,
        feeUsd: 0,
        slippageBps: 0,
        latencyMs: 1,
        timestamp: startMs,
      };
    }

    let realizedPrice = arrivalPrice;
    let feeBps = 7.5;
    let latencyMs = 8;

    if (this.mode === 'PAPER') {
      this.virtualFillsCount++;
      const dir = intent.side === 'BUY' ? 1 : -1;
      realizedPrice = arrivalPrice * (1 + (dir * 3) / 10000);
      feeBps = intent.venue.includes('amm') ? 30 : 7.5;
      latencyMs = 5;
    } else if (this.mode === 'SHADOW') {
      this.virtualFillsCount++;
      const dir = intent.side === 'BUY' ? 1 : -1;
      realizedPrice = arrivalPrice * (1 + (dir * 1.5) / 10000);
      feeBps = intent.venue.includes('amm') ? 30 : 7.5;
      latencyMs = 12;
    } else {
      this.liveApiCallsCount++;
      realizedPrice = arrivalPrice;
      latencyMs = 28;
    }

    const grossNotional = executedQty * realizedPrice;
    const feeUsd = Number(((grossNotional * feeBps) / 10000).toFixed(4));
    const priceDiff = (realizedPrice - arrivalPrice) / arrivalPrice;
    const slippageDir = intent.side === 'BUY' ? 1 : -1;
    const slippageBps = Number((priceDiff * slippageDir * 10000).toFixed(2));
    const status = partialFillRatio >= 0.999 ? 'FILLED' : 'PARTIALLY_FILLED';

    return {
      orderId: `ord-${this.mode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      intentId: intent.intentId,
      mode: this.mode,
      venue: intent.venue,
      status,
      executedQuantity: executedQty,
      averagePrice: realizedPrice,
      feeUsd,
      slippageBps,
      latencyMs,
      timestamp: Date.now(),
    };
  }

  public sliceTwap(totalQuantity: number, numSlices: number, totalDurationMs: number): OrderSlice[] {
    const slices: OrderSlice[] = [];
    const baseQty = Number((totalQuantity / numSlices).toFixed(6));
    const baseInterval = Math.floor(totalDurationMs / numSlices);
    let accumulatedQty = 0;

    for (let i = 0; i < numSlices; i++) {
      const isLast = i === numSlices - 1;
      const jitterFraction = ((i % 3) - 1) * 0.05; // bounded deterministic jitter within ±15%
      const rawQty = isLast ? totalQuantity - accumulatedQty : baseQty * (1 + jitterFraction);
      const sliceQty = Number(rawQty.toFixed(6));
      accumulatedQty += sliceQty;

      slices.push({
        sliceIndex: i,
        totalSlices: numSlices,
        quantity: sliceQty,
        targetTimestamp: Date.now() + i * baseInterval,
        delayMs: i * baseInterval,
        executed: false,
      });
    }

    return slices;
  }
}
