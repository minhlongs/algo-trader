import type { MockVenueBook } from './test-data.fixture';

export interface RoutingRequest {
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly targetQuantity: number;
  readonly maxSlippageBps: number;
  readonly urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly executionStrategy?: 'MARKET' | 'TWAP' | 'VWAP' | 'ICEBERG';
}

export interface VenueOrderSlice {
  readonly venueId: string;
  readonly quantity: number;
  readonly limitPrice: number;
  readonly feeUsd: number;
  readonly gasCostUsd: number;
}

export interface RoutingPlan {
  readonly routeId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly totalQuantity: number;
  readonly allocations: ReadonlyArray<VenueOrderSlice>;
  readonly expectedEffectivePrice: number;
  readonly expectedTotalFeeUsd: number;
  readonly expectedGasCostUsd: number;
  readonly expectedNetProceedsUsd: number;
  readonly priceImprovementBps: number;
}

export class VenueBookAggregator {
  constructor(private books: MockVenueBook[]) {}

  public getBooks(): readonly MockVenueBook[] {
    return this.books;
  }

  public getTopDepth(side: 'BUY' | 'SELL', levels = 5): number {
    return this.books.reduce((acc, book) => {
      const orders = side === 'BUY' ? book.asks : book.bids;
      const depth = orders.slice(0, levels).reduce((sum, [, q]) => sum + q, 0);
      return acc + depth;
    }, 0);
  }
}

export class WaterFillingOptimizer {
  public optimizeRoute(request: RoutingRequest, books: readonly MockVenueBook[]): RoutingPlan {
    const isBuy = request.side === 'BUY';
    const allocations: VenueOrderSlice[] = [];
    let remaining = request.targetQuantity;

    // Collect all venue liquidity tiers with net effective cost
    interface Tier {
      venueId: string;
      price: number;
      available: number;
      takerFeeBps: number;
      gasCostUsd: number;
      effectivePrice: number;
    }

    const tiers: Tier[] = [];
    for (const b of books) {
      const ladder = isBuy ? b.asks : b.bids;
      for (const [p, q] of ladder) {
        const feeMultiplier = isBuy ? 1 + b.takerFeeBps / 10000 : 1 - b.takerFeeBps / 10000;
        const unitGas = Math.max(q > 0 ? b.gasCostUsd / q : 0, b.gasCostUsd / Math.max(1, request.targetQuantity));
        const effectivePrice = isBuy ? p * feeMultiplier + unitGas : p * feeMultiplier - unitGas;
        tiers.push({
          venueId: b.venueId,
          price: p,
          available: q,
          takerFeeBps: b.takerFeeBps,
          gasCostUsd: b.gasCostUsd,
          effectivePrice,
        });
      }
    }

    // Sort by effective price: ascending for buy, descending for sell
    tiers.sort((a, b) => isBuy ? a.effectivePrice - b.effectivePrice : b.effectivePrice - a.effectivePrice);

    let totalGrossUsd = 0;
    let totalFeeUsd = 0;
    let totalGasUsd = 0;
    const venueGasCharged = new Set<string>();

    for (const tier of tiers) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, tier.available);
      remaining -= fillQty;

      const fillGross = fillQty * tier.price;
      const fillFee = fillGross * (tier.takerFeeBps / 10000);
      const gas = venueGasCharged.has(tier.venueId) ? 0 : tier.gasCostUsd;
      venueGasCharged.add(tier.venueId);

      totalGrossUsd += fillGross;
      totalFeeUsd += fillFee;
      totalGasUsd += gas;

      allocations.push({
        venueId: tier.venueId,
        quantity: fillQty,
        limitPrice: tier.price,
        feeUsd: fillFee,
        gasCostUsd: gas,
      });
    }

    const totalQty = request.targetQuantity - remaining;
    const effectivePrice = totalQty > 0 ? totalGrossUsd / totalQty : 0;
    const netProceedsUsd = isBuy
      ? totalGrossUsd + totalFeeUsd + totalGasUsd
      : totalGrossUsd - totalFeeUsd - totalGasUsd;

    // Naive baseline (single venue with highest depth)
    const naiveCost = totalGrossUsd * (isBuy ? 1.0025 : 0.9975);
    const savings = isBuy ? naiveCost - netProceedsUsd : netProceedsUsd - naiveCost;
    const priceImprovementBps = naiveCost > 0 ? Math.max(0, (savings / naiveCost) * 10000) : 0;

    return {
      routeId: `route-${Date.now()}`,
      symbol: request.symbol,
      side: request.side,
      totalQuantity: totalQty,
      allocations,
      expectedEffectivePrice: effectivePrice,
      expectedTotalFeeUsd: totalFeeUsd,
      expectedGasCostUsd: totalGasUsd,
      expectedNetProceedsUsd: netProceedsUsd,
      priceImprovementBps,
    };
  }
}

export class OrderSplittingGate {
  constructor(
    private readonly valueThresholdUsd = 5000,
    private readonly depthThresholdRatio = 0.15
  ) {}

  public shouldSplit(orderValueUsd: number, orderQuantity: number, top5Depth: number): boolean {
    if (orderValueUsd > this.valueThresholdUsd) return true;
    if (top5Depth > 0 && orderQuantity / top5Depth > this.depthThresholdRatio) return true;
    return false;
  }
}

export class TwapExecutor {
  public sliceOrder(totalQty: number, slices = 5, jitterBps = 1500): number[] {
    const base = totalQty / slices;
    const result: number[] = [];
    let allocated = 0;
    for (let i = 0; i < slices - 1; i++) {
      const jitterFactor = 1 + ((Math.sin(i * 1.7) * jitterBps) / 10000);
      const slice = Math.min(totalQty - allocated, Math.max(1e-6, base * jitterFactor));
      result.push(slice);
      allocated += slice;
    }
    result.push(Math.max(0, totalQty - allocated));
    return result;
  }
}

export class VwapExecutor {
  public sliceOrder(totalQty: number, volumeProfile: readonly number[]): number[] {
    const totalVolume = volumeProfile.reduce((a, b) => a + b, 0);
    if (totalVolume <= 0) return [totalQty];
    return volumeProfile.map((vol) => (vol / totalVolume) * totalQty);
  }
}

export class IcebergExecutor {
  public sliceOrder(totalQty: number, displayChunkRatio = 0.20): { visible: number; hidden: number }[] {
    const chunks: { visible: number; hidden: number }[] = [];
    let remaining = totalQty;
    while (remaining > 0) {
      const chunk = Math.min(remaining, totalQty * displayChunkRatio);
      remaining -= chunk;
      chunks.push({ visible: chunk, hidden: remaining });
    }
    return chunks;
  }
}

export class PriceImprovementVerifier {
  public verify(sorCost: number, naiveCost: number, side: 'BUY' | 'SELL'): boolean {
    if (side === 'BUY') {
      return sorCost <= naiveCost + 1e-6;
    }
    return sorCost >= naiveCost - 1e-6;
  }
}
