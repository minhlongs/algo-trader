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

/** One open position: positive size is long, negative size is short. */
interface OpenPosition {
  size: number;
  avgPrice: number;
  entryFills: number;
}

/**
 * IEEE-754 residue tolerance when comparing position sizes. Scaling in or out
 * over fractional fills (`0.1 + 0.2`, `1.0 - 0.7`) leaves a ~1e-16 residue;
 * treating that as an open position both skips entry-gas settlement and leaves
 * dust that swallows the next opposing fill.
 */
const POSITION_DUST_EPSILON = 1e-9;

export class BacktestOrderManager implements OrderManager {
  trades: BacktestTrade[] = [];
  equityCurve: Array<{ timestamp: string; equity: number }> = [];
  private capital: number;
  private currentEquity: number;
  private positions = new Map<string, OpenPosition>();
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
    const direction = side === 'BUY' ? 1 : -1;
    const closesPosition = existing !== undefined && existing.size * direction < 0;

    if (existing && closesPosition) {
      return this.settleClose(tokenId, existing, price, size);
    }

    if (existing) {
      // Opening or extending in this fill's direction: the volume-weighted entry
      // is recomputed over the position's absolute size, so extending a long and
      // extending a short average by the same rule. Every entry fill pays its own
      // gas when it settles.
      const openSize = Math.abs(existing.size) + size;
      this.positions.set(tokenId, {
        size: openSize * direction,
        avgPrice: (existing.avgPrice * Math.abs(existing.size) + price * size) / openSize,
        entryFills: existing.entryFills + 1,
      });
    } else {
      this.positions.set(tokenId, { size: size * direction, avgPrice: price, entryFills: 1 });
    }
    return null; // Unrealized until closed
  }

  /**
   * Reduce or close out a position the fill is opposing, settle the venue costs
   * on the closed portion, and return the net realized PnL.
   *
   * A short reversal is priced by the same rules as a long exit, with the
   * position's sign supplying the only difference: a short profits when the
   * buy-back is cheaper. Entry-fill gas is settled once, on the fill that closes
   * the position out.
   */
  private settleClose(
    tokenId: string,
    existing: OpenPosition,
    price: number,
    size: number,
  ): { pnl: number; fillCost: FillCostDetail } {
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

    // The ledger only credits realized PnL that survives venue costs.
    const gasFills = 1 + (chargeEntryGas ? entryFills : 0);
    const costs = applyVenueCosts({ price, size: closeSize, grossPnl: grossPnlUsd }, gasFills);
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

/**
 * Round to the cent so a retained gross figure cannot drift from the net figure
 * it was derived from.
 */
function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
