/**
 * Iceberg & Discretionary Peg Router
 * Slices block orders into randomized display slices with discretion offset price improvements.
 *
 * @module desk/execution/iceberg-discretionary-router
 */

import {
  IcebergChildSlice,
  IcebergOrderConfig,
} from './algo-execution-types';

export class IcebergDiscretionaryRouter {
  private readonly activeOrders = new Map<
    string,
    {
      config: IcebergOrderConfig;
      remainingReserve: number;
      sliceCount: number;
    }
  >();

  public createIcebergOrder(config: IcebergOrderConfig): IcebergChildSlice {
    const remainingReserve = config.totalQuantity;
    this.activeOrders.set(config.orderId, {
      config,
      remainingReserve,
      sliceCount: 0,
    });

    return this.generateNextSlice(config.orderId);
  }

  public replenishSlice(parentOrderId: string, filledQuantity: number): IcebergChildSlice | null {
    const record = this.activeOrders.get(parentOrderId);
    if (!record) return null;

    record.remainingReserve = Math.max(0, record.remainingReserve - filledQuantity);
    if (record.remainingReserve <= 0) {
      this.activeOrders.delete(parentOrderId);
      return null;
    }

    return this.generateNextSlice(parentOrderId);
  }

  public getRemainingReserve(parentOrderId: string): number {
    const record = this.activeOrders.get(parentOrderId);
    return record ? record.remainingReserve : 0;
  }

  private generateNextSlice(parentOrderId: string): IcebergChildSlice {
    const record = this.activeOrders.get(parentOrderId);
    if (!record) {
      throw new Error(`Order not found: ${parentOrderId}`);
    }

    const { config, remainingReserve } = record;
    record.sliceCount += 1;

    // Pseudo-random deterministic jitter based on slice count within displayVariancePct
    const jitterFactor = 1 + (((record.sliceCount * 17) % 21) - 10) * 0.01 * config.displayVariancePct;
    let targetSlice = Number((config.displayQuantity * jitterFactor).toFixed(4));

    if (targetSlice > remainingReserve) {
      targetSlice = remainingReserve;
    }

    const isFinalSlice = targetSlice >= remainingReserve;
    const discretionPrice =
      config.side === 'BUY'
        ? Number((config.limitPrice + config.discretionOffset).toFixed(4))
        : Number((config.limitPrice - config.discretionOffset).toFixed(4));

    return {
      childId: `ice-${config.orderId}-${record.sliceCount}`,
      parentOrderId: config.orderId,
      side: config.side,
      displayQuantity: targetSlice,
      limitPrice: config.limitPrice,
      discretionPrice,
      remainingParentReserve: Number((remainingReserve - targetSlice).toFixed(4)),
      isFinalSlice,
    };
  }
}
