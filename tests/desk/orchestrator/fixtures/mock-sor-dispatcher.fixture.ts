/**
 * Mock Tri-Mode Dispatcher & SOR Execution Bridge Fixture
 * Tri-Mode (PAPER, SHADOW, LIVE), TWAP/VWAP/Iceberg slicing, and slippage reconciliation
 */

import type {
  UnifiedTradeIntent,
  DispatchResult,
  TriMode,
  OrderSlice,
} from './harness-types';

export class MockTriModeDispatcher {
  private mode: TriMode = 'PAPER';
  private liveApiCallsCount = 0;
  private virtualFillsCount = 0;

  constructor(initialMode: TriMode = 'PAPER') {
    this.mode = initialMode;
  }

  public setMode(mode: TriMode): void {
    this.mode = mode;
  }

  public getMode(): TriMode {
    return this.mode;
  }

  public getLiveApiCallsCount(): number {
    return this.liveApiCallsCount;
  }

  public getVirtualFillsCount(): number {
    return this.virtualFillsCount;
  }

  public dispatch(
    intent: UnifiedTradeIntent,
    priceOverride?: number,
    partialFillRatio = 1.0
  ): DispatchResult {
    const executedQty = intent.quantity * Math.min(1.0, Math.max(0.0, partialFillRatio));
    const expectedPrice = intent.price ?? 65000;
    const arrivalPrice = priceOverride ?? expectedPrice;

    // Simulate realistic execution dynamics based on mode
    let realizedPrice = arrivalPrice;
    let feeBps = 5;
    let latencyMs = 12;

    if (this.mode === 'PAPER') {
      this.virtualFillsCount++;
      // Paper mode: zero live orders, modelled top-of-book slippage
      const slippageDirection = intent.side === 'BUY' ? 1 : -1;
      realizedPrice = arrivalPrice * (1 + (slippageDirection * 3) / 10000); // 3 bps slippage
      feeBps = intent.venue.includes('amm') ? 30 : 5;
      latencyMs = 5;
    } else if (this.mode === 'SHADOW') {
      this.virtualFillsCount++;
      // Shadow mode: virtual fills against live depth without capital commitment
      const slippageDirection = intent.side === 'BUY' ? 1 : -1;
      realizedPrice = arrivalPrice * (1 + (slippageDirection * 4) / 10000);
      feeBps = 5;
      latencyMs = 8;
    } else if (this.mode === 'LIVE') {
      this.liveApiCallsCount++;
      const slippageDirection = intent.side === 'BUY' ? 1 : -1;
      realizedPrice = arrivalPrice * (1 + (slippageDirection * 6) / 10000);
      feeBps = 6;
      latencyMs = 45;
    }

    const feeUsd = executedQty * realizedPrice * (feeBps / 10000);
    const slippageBps = expectedPrice > 0
      ? Math.abs((realizedPrice - expectedPrice) / expectedPrice) * 10000
      : 0;

    const status = partialFillRatio >= 1.0
      ? 'FILLED'
      : partialFillRatio > 0
      ? 'PARTIALLY_FILLED'
      : 'REJECTED';

    return {
      orderId: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      intentId: intent.intentId,
      mode: this.mode,
      venue: intent.venue,
      status,
      executedQuantity: executedQty,
      averagePrice: realizedPrice,
      feeUsd,
      slippageBps,
      latencyMs,
    };
  }

  // TWAP slicing with Box-Muller Gaussian jitter bounded to ±15%
  public twapSlice(totalQuantity: number, numSlices = 5, jitterBps = 1500): OrderSlice[] {
    const baseSlice = totalQuantity / numSlices;
    const slices: OrderSlice[] = [];
    let allocated = 0;

    for (let i = 0; i < numSlices - 1; i++) {
      // Bounded pseudo-Gaussian jitter
      const u1 = Math.max(1e-6, ((i * 37 + 13) % 100) / 100);
      const u2 = ((i * 49 + 27) % 100) / 100;
      const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const clampedJitter = Math.max(-1.0, Math.min(1.0, gaussian * 0.5));
      const jitterFactor = 1.0 + (clampedJitter * jitterBps) / 10000;

      const sliceQty = Math.max(1e-6, Math.min(totalQuantity - allocated, baseSlice * jitterFactor));
      allocated += sliceQty;
      slices.push({
        sliceIndex: i,
        totalSlices: numSlices,
        quantity: sliceQty,
        executedQuantity: sliceQty,
        averagePrice: 65000,
        feeUsd: sliceQty * 65000 * 0.0005,
        status: 'FILLED',
      });
    }

    const finalSlice = Math.max(0, totalQuantity - allocated);
    slices.push({
      sliceIndex: numSlices - 1,
      totalSlices: numSlices,
      quantity: finalSlice,
      executedQuantity: finalSlice,
      averagePrice: 65000,
      feeUsd: finalSlice * 65000 * 0.0005,
      status: 'FILLED',
    });

    return slices;
  }

  // VWAP slicing with intraday volume profile adaptation
  public vwapSlice(totalQuantity: number, volumeProfile: readonly number[]): OrderSlice[] {
    const totalVolume = volumeProfile.reduce((s, v) => s + v, 0);
    const n = volumeProfile.length;
    return volumeProfile.map((vol, idx) => {
      const sliceQty = totalVolume > 0 ? (vol / totalVolume) * totalQuantity : totalQuantity / n;
      return {
        sliceIndex: idx,
        totalSlices: n,
        quantity: sliceQty,
        executedQuantity: sliceQty,
        averagePrice: 65000,
        feeUsd: sliceQty * 65000 * 0.0005,
        status: 'FILLED',
      };
    });
  }

  // Iceberg slicing with visible display chunk and hidden reserves
  public icebergSlice(totalQuantity: number, displayRatio = 0.20): Array<{ visible: number; hidden: number }> {
    const chunks: Array<{ visible: number; hidden: number }> = [];
    let remaining = totalQuantity;
    while (remaining > 0) {
      const visible = Math.min(remaining, totalQuantity * displayRatio);
      remaining -= visible;
      chunks.push({ visible, hidden: remaining });
    }
    return chunks;
  }
}
