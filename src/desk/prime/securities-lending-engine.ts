/**
 * Securities Lending & Automated Locates Engine
 * Manages lendable inventory, dynamic utilization-based borrow fee curves, and locate authorizations.
 *
 * @module desk/prime/securities-lending-engine
 */

import {
  InventoryPool,
  LocateAuthorization,
  LocateRequest,
} from './prime-types';

export interface LendingCurveConfig {
  baseFeeBps: number;
  kinkUtilization: number;
  slope1: number;
  slope2: number;
}

export class SecuritiesLendingEngine {
  private readonly inventory = new Map<string, InventoryPool>();
  private readonly activeLocates = new Map<string, LocateAuthorization>();
  private readonly curveConfig: LendingCurveConfig;

  public constructor(config?: Partial<LendingCurveConfig>) {
    this.curveConfig = {
      baseFeeBps: config?.baseFeeBps ?? 50, // 50 bps base fee
      kinkUtilization: config?.kinkUtilization ?? 0.8, // 80% optimal utilization kink
      slope1: config?.slope1 ?? 150, // 150 bps slope below kink
      slope2: config?.slope2 ?? 3000, // steep slope past kink for hard-to-borrow
    };
  }

  public registerInventory(
    symbol: string,
    internalLendable: number,
    thirdPartyLendable: number
  ): void {
    const total = internalLendable + thirdPartyLendable;
    this.inventory.set(symbol, {
      symbol,
      totalQuantity: total,
      allocatedQuantity: 0,
      availableQuantity: total,
      internalLendable,
      thirdPartyLendable,
    });
  }

  public calculateBorrowRate(symbol: string): number {
    const pool = this.inventory.get(symbol);
    if (!pool || pool.totalQuantity <= 0) {
      return this.curveConfig.baseFeeBps + this.curveConfig.slope2; // max penalty
    }

    const utilization = pool.allocatedQuantity / pool.totalQuantity;
    if (utilization <= this.curveConfig.kinkUtilization) {
      const ratio = utilization / this.curveConfig.kinkUtilization;
      return Number((this.curveConfig.baseFeeBps + ratio * this.curveConfig.slope1).toFixed(2));
    }

    const excessRatio = (utilization - this.curveConfig.kinkUtilization) / (1 - this.curveConfig.kinkUtilization);
    const rate = this.curveConfig.baseFeeBps + this.curveConfig.slope1 + excessRatio * this.curveConfig.slope2;
    return Number(rate.toFixed(2));
  }

  public processLocate(request: LocateRequest): LocateAuthorization {
    this.pruneExpiredLocates(request.requestedAtMs);
    const pool = this.inventory.get(request.symbol);

    if (!pool || pool.availableQuantity < request.quantity) {
      return {
        locateId: `loc-rej-${request.requestId}`,
        clientAccountId: request.clientAccountId,
        symbol: request.symbol,
        quantity: request.quantity,
        rateBps: this.calculateBorrowRate(request.symbol),
        authorizedAtMs: request.requestedAtMs,
        expiresAtMs: request.requestedAtMs,
        status: 'REJECTED',
      };
    }

    // Allocate inventory
    pool.allocatedQuantity += request.quantity;
    pool.availableQuantity = pool.totalQuantity - pool.allocatedQuantity;

    const rate = this.calculateBorrowRate(request.symbol);
    const auth: LocateAuthorization = {
      locateId: `loc-auth-${request.requestId}`,
      clientAccountId: request.clientAccountId,
      symbol: request.symbol,
      quantity: request.quantity,
      rateBps: rate,
      authorizedAtMs: request.requestedAtMs,
      expiresAtMs: request.requestedAtMs + request.validityMs,
      status: 'GRANTED',
    };

    this.activeLocates.set(auth.locateId, auth);
    return auth;
  }

  public releaseLocate(locateId: string): boolean {
    const auth = this.activeLocates.get(locateId);
    if (!auth || auth.status !== 'GRANTED') {
      return false;
    }

    const pool = this.inventory.get(auth.symbol);
    if (pool) {
      pool.allocatedQuantity = Math.max(0, pool.allocatedQuantity - auth.quantity);
      pool.availableQuantity = pool.totalQuantity - pool.allocatedQuantity;
    }

    auth.status = 'FULFILLED';
    this.activeLocates.delete(locateId);
    return true;
  }

  public getInventory(symbol: string): InventoryPool | undefined {
    return this.inventory.get(symbol);
  }

  public pruneExpiredLocates(currentTimestampMs: number): number {
    let expiredCount = 0;
    for (const [id, auth] of this.activeLocates.entries()) {
      if (currentTimestampMs >= auth.expiresAtMs) {
        const pool = this.inventory.get(auth.symbol);
        if (pool) {
          pool.allocatedQuantity = Math.max(0, pool.allocatedQuantity - auth.quantity);
          pool.availableQuantity = pool.totalQuantity - pool.allocatedQuantity;
        }
        auth.status = 'EXPIRED';
        this.activeLocates.delete(id);
        expiredCount++;
      }
    }
    return expiredCount;
  }
}
