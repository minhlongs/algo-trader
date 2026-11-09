/**
 * Backtest Order Manager
 *
 * Simulated OrderManager for backtesting: records trades, tracks positions,
 * and computes realized PnL per fill. No real orders are ever placed.
 */

import type { OrderManager } from '../polymarket/order-manager';
import type { BacktestTrade } from './types';
import { applyVenueCosts } from './backtest-fee-application';
import type { PolymarketCategory } from '../polymarket/polymarket-fee-calculator';

/** Optional CLOB V2 quadratic fee / maker rebate configuration for backtest runs. */
export interface BacktestVenueFeeOptions {
  clobV2Category?: PolymarketCategory;
  postOnly?: boolean;
}

/** Fill cost detail per closed trade, retained so a run can be audited. */
export interface FillCostDetail {
  grossPnlUsd: number;
  feeUsd: number;
  gasUsd: number;
  rebateUsd?: number;
  netPnlUsd: number;
}

/** One open position: positive size is long, negative size is short. */
interface OpenPosition {
  size: number;
  avgPrice: number;
  entryFills: number;
}

/** IEEE-754 residue tolerance when comparing position sizes. */
const POSITION_DUST_EPSILON = 1e-9;

export class BacktestOrderManager implements OrderManager {
  trades: BacktestTrade[] = [];
  equityCurve: Array<{ timestamp: string; equity: number }> = [];
  private fillEquityCurve: Array<{ timestamp: string; equity: number }> = [];
  private capital: number;
  private currentEquity: number;
  private positions = new Map<string, OpenPosition>();
  private fillCosts: FillCostDetail[] = [];
  private feeOptions: BacktestVenueFeeOptions;

  constructor(capital: number, feeOptions: BacktestVenueFeeOptions = {}) {
    this.capital = capital;
    this.currentEquity = capital;
    this.feeOptions = feeOptions;
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
      size: close?.closedSize ?? size,
      pnl: close?.pnl ?? null,
    };
    this.trades.push(trade);

    if (close) {
      if (this.fillEquityCurve.length === 0) {
        this.fillEquityCurve.push({ timestamp: this.trades[0]!.timestamp, equity: this.capital });
      }
      this.fillCosts.push(close.fillCost);
      this.currentEquity = roundUsd(this.currentEquity + close.pnl);
      this.fillEquityCurve.push({ timestamp: trade.timestamp, equity: this.currentEquity });
    }

    return { id: `backtest-${this.trades.length}` };
  }

  async cancelOrder(_orderId: string): Promise<void> {}
  async cancelAllOrders(_tokenId?: string): Promise<void> {}
  async getOpenOrders(_tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>> {
    return [];
  }

  getTrades(): BacktestTrade[] { return [...this.trades]; }
  /** Per-close cost audit trail, parallel to `trades` closed rows. */
  getFillCosts(): FillCostDetail[] { return [...this.fillCosts]; }
  getEquityCurve(): Array<{ timestamp: string; equity: number }> {
    return this.equityCurve.length > 0 ? [...this.equityCurve] : [...this.fillEquityCurve];
  }
  getCurrentEquity(): number { return this.currentEquity; }

  private computeClose(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
  ): { pnl: number; closedSize: number; fillCost: FillCostDetail } | null {
    const existing = this.positions.get(tokenId);
    const direction = side === 'BUY' ? 1 : -1;
    const closesPosition = existing !== undefined && existing.size * direction < 0;

    if (existing && closesPosition) {
      return this.settleClose(tokenId, existing, price, size);
    }

    if (existing) {
      const openSize = Math.abs(existing.size) + size;
      this.positions.set(tokenId, {
        size: openSize * direction,
        avgPrice: (existing.avgPrice * Math.abs(existing.size) + price * size) / openSize,
        entryFills: existing.entryFills + 1,
      });
    } else {
      this.positions.set(tokenId, { size: size * direction, avgPrice: price, entryFills: 1 });
    }
    return null;
  }

  private settleClose(
    tokenId: string,
    existing: OpenPosition,
    price: number,
    size: number,
  ): { pnl: number; closedSize: number; fillCost: FillCostDetail } {
    const positionSign = existing.size > 0 ? 1 : -1;
    const openSize = existing.size * positionSign;
    const closeSize = Math.min(size, openSize);
    const grossPnlUsd = closeSize * (price - existing.avgPrice) * positionSign;
    const remaining = openSize - closeSize;
    const chargeEntryGas = remaining <= POSITION_DUST_EPSILON;
    const entryFills = existing.entryFills;

    if (chargeEntryGas) {
      this.positions.delete(tokenId);
    } else {
      this.positions.set(tokenId, { size: remaining * positionSign, avgPrice: existing.avgPrice, entryFills });
    }

    const gasFills = 1 + (chargeEntryGas ? entryFills : 0);
    const costs = applyVenueCosts(
      {
        price,
        size: closeSize,
        grossPnl: grossPnlUsd,
        entryPrice: existing.avgPrice,
        clobV2Category: this.feeOptions.clobV2Category,
        postOnly: this.feeOptions.postOnly,
      },
      gasFills,
    );
    return {
      pnl: costs.netPnl,
      closedSize: closeSize,
      fillCost: {
        grossPnlUsd: roundUsd(grossPnlUsd),
        feeUsd: costs.feeUsd,
        gasUsd: costs.gasUsd,
        rebateUsd: costs.rebateUsd,
        netPnlUsd: costs.netPnl,
      },
    };
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
