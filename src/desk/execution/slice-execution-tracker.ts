/**
 * Slice Execution Tracker & Slippage Reconciler (Milestone 3 - R3)
 * Tracks execution progress, calculates realized slippage in bps, and reconciles taker fees.
 */

import type { OrderSide } from '../sor/sor-types';
import type { DispatchStatus, OrderSlice } from './tri-mode-types';

export interface SliceExecutionSummary {
  readonly status: DispatchStatus;
  readonly executedQuantity: number;
  readonly averagePrice: number;
  readonly feeUsd: number;
  readonly slippageBps: number;
  readonly filledSlicesCount: number;
}

export class SliceExecutionTracker {
  private readonly slices: OrderSlice[] = [];
  private readonly side: OrderSide;
  private readonly arrivalPrice: number;
  private readonly takerFeeBps: number;

  constructor(side: OrderSide, arrivalPrice: number, takerFeeBps = 7.5) {
    this.side = side;
    this.arrivalPrice = arrivalPrice;
    this.takerFeeBps = takerFeeBps;
  }

  public registerSlices(slices: readonly OrderSlice[]): void {
    this.slices.push(...slices);
  }

  public recordSliceFill(sliceIndex: number, executedPrice: number): void {
    const slice = this.slices.find((s) => s.sliceIndex === sliceIndex);
    if (slice) {
      slice.executed = true;
      slice.executedPrice = executedPrice;
    }
  }

  public computeSummary(partialFillRatio = 1.0): SliceExecutionSummary {
    const totalQty = this.slices.reduce((sum, s) => sum + s.quantity, 0);
    const clampedRatio = Math.min(1.0, Math.max(0.0, partialFillRatio));
    const executedQuantity = totalQty * clampedRatio;

    if (clampedRatio === 0 || executedQuantity === 0) {
      return {
        status: 'REJECTED',
        executedQuantity: 0,
        averagePrice: this.arrivalPrice,
        feeUsd: 0,
        slippageBps: 0,
        filledSlicesCount: 0,
      };
    }

    const filledSlices = this.slices.filter((s) => s.executed);
    let weightedPriceSum = 0;
    let filledQty = 0;

    for (const slice of filledSlices) {
      const price = slice.executedPrice ?? this.arrivalPrice;
      weightedPriceSum += slice.quantity * price;
      filledQty += slice.quantity;
    }

    const averagePrice = filledQty > 0 ? weightedPriceSum / filledQty : this.arrivalPrice;
    const slippageDirection = this.side === 'BUY' ? 1 : -1;
    const priceDiffRatio = (averagePrice - this.arrivalPrice) / this.arrivalPrice;
    const slippageBps = Number((priceDiffRatio * slippageDirection * 10000).toFixed(2));

    const grossNotional = executedQuantity * averagePrice;
    const feeUsd = Number(((grossNotional * this.takerFeeBps) / 10000).toFixed(4));
    const status: DispatchStatus = clampedRatio >= 0.999 ? 'FILLED' : 'PARTIALLY_FILLED';

    return {
      status,
      executedQuantity,
      averagePrice,
      feeUsd,
      slippageBps,
      filledSlicesCount: filledSlices.length,
    };
  }
}
