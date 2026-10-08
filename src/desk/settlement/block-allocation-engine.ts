/**
 * Institutional Block Trade & Average Price Allocation Engine (APAMA)
 * Aggregates multi-fill block trades into an exact VWAP and allocates to sub-accounts with residual share handling.
 *
 * @module desk/settlement/block-allocation-engine
 */

import {
  BlockTradeFill,
  AccountAllocationTarget,
  AllocatedTradeRecord,
} from './settlement-types';

export class BlockAllocationEngine {
  /**
   * Calculates volume-weighted average price (VWAP) across all fills.
   */
  public computeBlockVwap(fills: BlockTradeFill[]): { totalQuantity: number; averagePrice: number } {
    if (fills.length === 0) {
      throw new Error('Cannot compute VWAP on empty fills array');
    }

    let totalQuantity = 0;
    let totalNotional = 0;

    for (const fill of fills) {
      if (fill.quantity <= 0 || fill.price <= 0) {
        throw new Error('Fill quantity and price must be strictly positive');
      }
      totalQuantity += fill.quantity;
      totalNotional += fill.quantity * fill.price;
    }

    const averagePrice = Number((totalNotional / totalQuantity).toFixed(6));
    return { totalQuantity, averagePrice };
  }

  /**
   * Allocates an aggregated block to accounts according to predetermined percentage targets.
   * Uses largest remainder / integer residual allocation for zero share loss.
   */
  public allocateBlockTrade(
    parentBlockId: string,
    fills: BlockTradeFill[],
    targets: AccountAllocationTarget[]
  ): AllocatedTradeRecord[] {
    const { totalQuantity, averagePrice } = this.computeBlockVwap(fills);
    const targetSum = targets.reduce((sum, t) => sum + t.percentageBasis, 0);

    if (Math.abs(targetSum - 1.0) > 0.0001) {
      throw new Error(`Allocation percentages must sum to 1.0, got ${targetSum}`);
    }

    const representativeFill = fills[0];
    if (!representativeFill) {
      throw new Error('Fills array is empty');
    }

    const allocations: AllocatedTradeRecord[] = [];
    let allocatedTotalShares = 0;

    // First pass: floor allocations
    const rawAllocations = targets.map((t, idx) => {
      const targetExact = totalQuantity * t.percentageBasis;
      const targetFloor = Math.floor(targetExact);
      const remainder = targetExact - targetFloor;
      return { target: t, floor: targetFloor, remainder, originalIndex: idx };
    });

    allocatedTotalShares = rawAllocations.reduce((sum, a) => sum + a.floor, 0);
    let remainingResidual = Math.round(totalQuantity - allocatedTotalShares);

    // Sort descending by remainder to distribute 1 share residual
    const sortedByRemainder = [...rawAllocations].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remainingResidual; i++) {
      const item = sortedByRemainder[i % sortedByRemainder.length];
      if (item) {
        item.floor += 1;
      }
    }

    // Reconstruct original order
    rawAllocations.sort((a, b) => a.originalIndex - b.originalIndex);

    for (let i = 0; i < rawAllocations.length; i++) {
      const item = rawAllocations[i];
      if (!item) continue;
      const shares = item.floor;
      const notional = Number((shares * averagePrice).toFixed(2));

      allocations.push({
        allocationId: `alloc-${parentBlockId}-${i + 1}`,
        parentBlockId,
        targetAccountId: item.target.accountId,
        symbol: representativeFill.symbol,
        side: representativeFill.side,
        allocatedQuantity: shares,
        averageExecutionPrice: averagePrice,
        totalNotionalUsd: notional,
        roundingResidualShares: remainingResidual > 0 && i < remainingResidual ? 1 : 0,
      });
    }

    return allocations;
  }
}
