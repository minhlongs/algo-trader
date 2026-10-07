import type {
  AmmLiquidityPool,
  ClobBook,
  OptimizedCrossRoute,
  RouteSplitAllocation,
} from './smart-cross-types';

export class SmartCrossRouter {
  public calculateAmmBuyCost(pool: AmmLiquidityPool, quantity: number): number | null {
    if (quantity <= 0) return 0;
    if (quantity >= pool.reserveOutcome) return null; // Exceeds liquidity

    const deltaCollateral = (pool.reserveCollateral * quantity) / (pool.reserveOutcome - quantity);
    const costWithFee = deltaCollateral / (1 - pool.feeRate);
    return costWithFee;
  }

  public calculateClobBuyCost(clob: ClobBook, quantity: number): { costUsd: number; filledQty: number } {
    if (quantity <= 0) return { costUsd: 0, filledQty: 0 };

    let remaining = quantity;
    let totalBaseCost = 0;
    let filledQty = 0;

    const sortedAsks = [...clob.asks].sort((a, b) => a.price - b.price);
    for (const level of sortedAsks) {
      if (remaining <= 0) break;
      const takeQty = Math.min(remaining, level.availableQuantity);
      totalBaseCost += takeQty * level.price;
      filledQty += takeQty;
      remaining -= takeQty;
    }

    const costWithFee = totalBaseCost * (1 + clob.feeRate);
    return { costUsd: costWithFee, filledQty };
  }

  public optimizeSplit(params: {
    totalQuantity: number;
    ammPool: AmmLiquidityPool;
    clobBook: ClobBook;
    splitSteps?: number;
  }): OptimizedCrossRoute {
    const { totalQuantity, ammPool, clobBook, splitSteps = 20 } = params;
    let bestTotalCost = Infinity;
    let bestAmmQty = 0;
    let bestClobQty = 0;

    for (let i = 0; i <= splitSteps; i++) {
      const ammRatio = i / splitSteps;
      const testAmmQty = totalQuantity * ammRatio;
      const testClobQty = totalQuantity - testAmmQty;

      const ammCost = this.calculateAmmBuyCost(ammPool, testAmmQty);
      if (ammCost === null) continue;

      const clobResult = this.calculateClobBuyCost(clobBook, testClobQty);
      if (clobResult.filledQty < testClobQty * 0.9999) continue; // Book too thin for this split

      const combinedCost = ammCost + clobResult.costUsd;
      if (combinedCost < bestTotalCost) {
        bestTotalCost = combinedCost;
        bestAmmQty = testAmmQty;
        bestClobQty = testClobQty;
      }
    }

    const allocations: RouteSplitAllocation[] = [];
    if (bestAmmQty > 0) {
      const ammCost = this.calculateAmmBuyCost(ammPool, bestAmmQty) ?? 0;
      allocations.push({
        venueType: 'AMM',
        venueId: ammPool.poolId,
        allocatedQuantity: Math.round(bestAmmQty * 1000) / 1000,
        effectiveAvgPrice: Math.round((ammCost / bestAmmQty) * 10000) / 10000,
        expectedCostUsd: Math.round(ammCost * 100) / 100,
      });
    }

    if (bestClobQty > 0) {
      const clobCost = this.calculateClobBuyCost(clobBook, bestClobQty).costUsd;
      allocations.push({
        venueType: 'CLOB',
        venueId: clobBook.bookId,
        allocatedQuantity: Math.round(bestClobQty * 1000) / 1000,
        effectiveAvgPrice: Math.round((clobCost / bestClobQty) * 10000) / 10000,
        expectedCostUsd: Math.round(clobCost * 100) / 100,
      });
    }

    const totalAllocated = bestAmmQty + bestClobQty;
    const blendedPrice = totalAllocated > 0 ? bestTotalCost / totalAllocated : 0;

    return {
      totalRequestedQuantity: totalQuantity,
      totalAllocatedQuantity: Math.round(totalAllocated * 1000) / 1000,
      totalCostUsd: Math.round(bestTotalCost * 100) / 100,
      blendedAvgPrice: Math.round(blendedPrice * 10000) / 10000,
      allocations,
    };
  }
}
