/**
 * Backtest Order Manager
 *
 * Simulated OrderManager for backtesting: records trades, tracks positions,
 * and computes realized PnL per fill. No real orders are ever placed.
 */

import type { OrderManager } from '../polymarket/order-manager';
import type { BacktestTrade } from './types';

export class BacktestOrderManager implements OrderManager {
  trades: BacktestTrade[] = [];
  equityCurve: Array<{ timestamp: string; equity: number }> = [];
  private capital: number;
  private currentEquity: number;
  private positions = new Map<string, { size: number; avgPrice: number }>();

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
  }): Promise<{ id: string }> {
    const side = params.side === 'buy' ? 'BUY' : 'SELL';
    const price = parseFloat(String(params.price));
    const size = parseFloat(String(params.size));
    const pnl = this.computePnl(params.tokenId, side, price, size);

    const trade: BacktestTrade = {
      timestamp: new Date().toISOString(),
      tokenId: params.tokenId,
      side,
      price,
      size,
      pnl,
    };
    this.trades.push(trade);

    if (pnl !== null) {
      this.currentEquity += pnl;
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

  getEquityCurve(): Array<{ timestamp: string; equity: number }> {
    return [...this.equityCurve];
  }

  getCurrentEquity(): number {
    return this.currentEquity;
  }

  private computePnl(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
  ): number | null {
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
      const pnl = closeSize * (price - existing.avgPrice);
      const remaining = existing.size - closeSize;
      if (remaining <= 0) {
        this.positions.delete(tokenId);
      } else {
        this.positions.set(tokenId, { size: remaining, avgPrice: existing.avgPrice });
      }
      return pnl;
    }
  }
}
