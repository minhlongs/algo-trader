/**
 * Backtest Order Manager
 *
 * Simulated OrderManager for backtesting: records trades, tracks positions,
 * and computes realized PnL per fill. No real orders are ever placed.
 */

import type { OrderManager } from '../polymarket/order-manager';
import type { BacktestTrade } from './types';
import { applyVenueCosts } from './backtest-fee-application';

/** Fill cost detail per closed trade, retained so a run can be audited. */
export interface FillCostDetail {
  grossPnlUsd: number;
  feeUsd: number;
  gasUsd: number;
  netPnlUsd: number;
}

export class BacktestOrderManager implements OrderManager {
  trades: BacktestTrade[] = [];
  equityCurve: Array<{ timestamp: string; equity: number }> = [];
  private capital: number;
  private currentEquity: number;
  private positions = new Map<string, { size: number; avgPrice: number }>();
  private fillCosts: FillCostDetail[] = [];

  constructor(capital: number) {
    this.capital = capital;
    this.currentEquity = capital;
  }

  async placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string | number;
    size: string | number;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
    timestamp?: string;
  }): Promise<{ id: string }> {
    const side = params.side === 'buy' ? 'BUY' : 'SELL';
    const price = parseFloat(String(params.price));
    const size = parseFloat(String(params.size));
    const close = this.computeClose(params.tokenId, side, price, size);

    const trade: BacktestTrade = {
      timestamp: params.timestamp ?? new Date().toISOString(),
      tokenId: params.tokenId,
      side,
      price,
      size,
      pnl: close?.pnl ?? null,
    };
    this.trades.push(trade);

    if (close) {
      this.fillCosts.push(close.fillCost);
      this.currentEquity += close.pnl;
    }

    return { id: `backtest-${this.trades.length}` };
  }

  async cancelOrder(_orderId: string): Promise<void> {
    // No-op in backtesting
  }

  async cancelAllOrders(_tokenId?: string): Promise<void> {
    // No-op in backtesting
  }

  async getOpenOrders(_tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>> {
    return [];
  }

  getTrades(): BacktestTrade[] {
    return [...this.trades];
  }

  /** Per-close cost audit trail, parallel to `trades` closed rows. */
  getFillCosts(): FillCostDetail[] {
    return [...this.fillCosts];
  }

  getEquityCurve(): Array<{ timestamp: string; equity: number }> {
    return [...this.equityCurve];
  }

  getCurrentEquity(): number {
    return this.currentEquity;
  }

  /**
   * Apply one fill to the position ledger and, when it closes a position,
   * return net-of-venue-costs PnL plus the cost breakdown behind it.
   *
   * Returns null for fills that only open or extend a position: no round trip
   * has closed, so there is no realized PnL to report yet.
   */
  private computeClose(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
  ): { pnl: number; fillCost: FillCostDetail } | null {
    const existing = this.positions.get(tokenId);
    if (side === 'BUY') {
      // Opening or adding to position
      if (existing) {
        const newSize = existing.size + size;
        const newAvgPrice =
          (existing.avgPrice * existing.size + price * size) / newSize;
        this.positions.set(tokenId, { size: newSize, avgPrice: newAvgPrice });
      } else {
        this.positions.set(tokenId, { size, avgPrice: price });
      }
      return null; // Unrealized until sold
    } else {
      // SELL — closing or reducing
      if (!existing || existing.size <= 0) {
        // Short entry or no position — treat as opening short
        this.positions.set(tokenId, { size: -size, avgPrice: price });
        return null;
      }
      const closeSize = Math.min(size, existing.size);
      const grossPnlUsd = closeSize * (price - existing.avgPrice);
      const remaining = existing.size - closeSize;
      if (remaining <= 0) {
        this.positions.delete(tokenId);
      } else {
        this.positions.set(tokenId, { size: remaining, avgPrice: existing.avgPrice });
      }

      // The ledger only credits realized PnL that survives venue costs.
      const costs = applyVenueCosts({ price, size: closeSize, grossPnl: grossPnlUsd });
      return {
        pnl: costs.netPnl,
        fillCost: {
          grossPnlUsd: roundUsd(grossPnlUsd),
          feeUsd: costs.feeUsd,
          gasUsd: costs.gasUsd,
          netPnlUsd: costs.netPnl,
        },
      };
    }
  }
}

/**
 * Round to the cent so a retained gross figure cannot drift from the net figure
 * it was derived from.
 */
function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
