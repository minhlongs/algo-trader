/**
 * Paper Trading Harness
 *
 * Simulates limit and market order executions against L2 order book snapshots
 * with realistic taker fee modeling, slippage, and portfolio balances.
 *
 * @module desk/sandbox/paper-trading-harness
 */

import { EventEmitter } from 'events';
import type { BookLevel } from '../execution/pm-sor-types';
import type {
  PaperOrderRequest,
  PaperFillRecord,
  VirtualPosition,
  PaperAccountSummary,
} from './paper-trading-types';

export class PaperTradingHarness extends EventEmitter {
  private cashBalanceUsd: number;
  private readonly defaultTakerFeeRate: number;
  private totalFeesPaidUsd = 0;
  private positions = new Map<string, VirtualPosition>();

  constructor(initialCashUsd: number = 100000, takerFeeRate: number = 0.002) {
    super();
    this.cashBalanceUsd = initialCashUsd;
    this.defaultTakerFeeRate = takerFeeRate;
  }

  public simulateOrder(params: {
    request: PaperOrderRequest;
    bookLevels: readonly BookLevel[];
    feeRate?: number;
    timestamp?: number;
  }): PaperFillRecord {
    const { request, bookLevels } = params;
    const feeRate = params.feeRate ?? this.defaultTakerFeeRate;
    const timestamp = params.timestamp ?? Date.now();

    let remainingQty = Math.max(0, request.quantity);
    let filledQty = 0;
    let totalCost = 0;

    for (const level of bookLevels) {
      if (remainingQty <= 0) break;
      if (request.orderType === 'LIMIT' && request.limitPrice !== undefined) {
        if (request.action === 'BUY' && level.price > request.limitPrice) break;
        if (request.action === 'SELL' && level.price < request.limitPrice) break;
      }

      const takeQty = Math.min(remainingQty, level.quantity);
      if (takeQty <= 0) continue;

      totalCost += takeQty * level.price;
      filledQty += takeQty;
      remainingQty -= takeQty;
    }

    const avgPrice = filledQty > 0 ? totalCost / filledQty : 0;
    const feeUsd = totalCost * feeRate;

    if (filledQty > 0) {
      this.updatePortfolio({
        marketId: request.marketId,
        outcome: request.outcome,
        action: request.action,
        quantity: filledQty,
        totalCost,
        feeUsd,
      });
    }

    const record: PaperFillRecord = {
      orderId: request.orderId,
      marketId: request.marketId,
      outcome: request.outcome,
      action: request.action,
      filledQuantity: filledQty,
      averagePrice: avgPrice,
      feeUsd,
      totalCostUsd: totalCost,
      timestamp,
    };

    this.emit('orderFilled', record);
    return record;
  }

  public getSummary(markPrices: Map<string, number> = new Map()): PaperAccountSummary {
    let positionsValue = 0;
    for (const [key, pos] of this.positions.entries()) {
      const mark = markPrices.get(key) ?? (pos.quantity > 0 ? pos.costBasisUsd / pos.quantity : 0);
      positionsValue += pos.quantity * mark;
    }

    return {
      cashBalanceUsd: this.cashBalanceUsd,
      positionsValueUsd: positionsValue,
      totalEquityUsd: this.cashBalanceUsd + positionsValue,
      totalFeesPaidUsd: this.totalFeesPaidUsd,
      positionsCount: this.positions.size,
    };
  }

  public getPosition(marketId: string, outcome: string): VirtualPosition | undefined {
    return this.positions.get(`${marketId}:${outcome}`);
  }

  private updatePortfolio(fill: {
    marketId: string;
    outcome: string;
    action: string;
    quantity: number;
    totalCost: number;
    feeUsd: number;
  }): void {
    const key = `${fill.marketId}:${fill.outcome}`;
    const existing = this.positions.get(key) ?? {
      marketId: fill.marketId,
      outcome: fill.outcome as 'YES' | 'NO',
      quantity: 0,
      costBasisUsd: 0,
    };

    if (fill.action === 'BUY') {
      this.cashBalanceUsd -= fill.totalCost + fill.feeUsd;
      this.totalFeesPaidUsd += fill.feeUsd;
      this.positions.set(key, {
        marketId: fill.marketId,
        outcome: fill.outcome as 'YES' | 'NO',
        quantity: existing.quantity + fill.quantity,
        costBasisUsd: existing.costBasisUsd + fill.totalCost,
      });
    } else {
      this.cashBalanceUsd += fill.totalCost - fill.feeUsd;
      this.totalFeesPaidUsd += fill.feeUsd;
      const newQty = Math.max(0, existing.quantity - fill.quantity);
      if (newQty === 0) {
        this.positions.delete(key);
      } else {
        const remainingBasisRatio = newQty / existing.quantity;
        this.positions.set(key, {
          marketId: fill.marketId,
          outcome: fill.outcome as 'YES' | 'NO',
          quantity: newQty,
          costBasisUsd: existing.costBasisUsd * remainingBasisRatio,
        });
      }
    }
  }
}
