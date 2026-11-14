/**
 * Backtest Order Manager — simulated OrderManager for backtesting.
 * Records trades, tracks positions, and computes net realized PnL. No live orders.
 */

import type { OrderManager } from '../polymarket/order-manager';
import type { FeeScheduleResolver } from '../polymarket/fee-schedule-resolver';
import type { PolymarketCategory, PolymarketFeeSchedule } from '../polymarket/polymarket-fee-calculator';
import type { BacktestTrade } from './types';
import { applyVenueCosts, type BacktestLegOrderType } from './backtest-fee-application';
import { settleBacktestBundleConversion, type BundleConversionParams } from './backtest-bundle-conversion';

export interface BacktestVenueFeeOptions {
  feeResolver?: FeeScheduleResolver;
  clobV2Category?: PolymarketCategory;
  postOnly?: boolean;
}

export interface FillCostDetail {
  grossPnlUsd: number;
  feeUsd: number;
  gasUsd: number;
  rebateUsd?: number;
  netPnlUsd: number;
}

interface OpenPosition {
  size: number;
  avgPrice: number;
  entryFills: number;
  entryOrderType?: BacktestLegOrderType;
}

const POSITION_DUST_EPSILON = 1e-9;
const roundUsd = (v: number): number => Math.round(v * 100) / 100;

export class BacktestOrderManager implements OrderManager {
  trades: BacktestTrade[] = [];
  equityCurve: Array<{ timestamp: string; equity: number }> = [];
  private fillEquityCurve: Array<{ timestamp: string; equity: number }> = [];
  private capital: number;
  private currentEquity: number;
  private positions = new Map<string, OpenPosition>();
  private fillCosts: FillCostDetail[] = [];
  private readonly feeResolver?: FeeScheduleResolver;
  private readonly feeOptions: BacktestVenueFeeOptions;
  private currentTimestampIso: string | null = null;
  private markPrices = new Map<string, number>();

  constructor(capital: number, options: BacktestVenueFeeOptions = {}) {
    this.capital = capital;
    this.currentEquity = capital;
    this.feeResolver = options.feeResolver;
    this.feeOptions = options;
  }

  setCurrentTimestamp(iso: string | null): void { this.currentTimestampIso = iso; }
  updatePrices(prices: ReadonlyMap<string, number>): void { this.markPrices = new Map(prices); }

  async placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string | number;
    size: string | number;
    orderType?: BacktestLegOrderType;
    timestamp?: string;
  }): Promise<{ id: string }> {
    const side = params.side === 'buy' ? 'BUY' : 'SELL';
    const price = parseFloat(String(params.price));
    const size = parseFloat(String(params.size));
    const schedule = this.feeResolver ? await this.feeResolver.resolve(params.tokenId) : undefined;
    const close = this.computeClose(params.tokenId, side, price, size, schedule, params.orderType);
    const trade: BacktestTrade = {
      timestamp: params.timestamp ?? this.currentTimestampIso ?? new Date().toISOString(),
      tokenId: params.tokenId, side, price,
      size: close?.closedSize ?? size,
      pnl: close?.pnl ?? null,
      ...(close ? { venueCostUsd: roundUsd(Math.max(0, close.fillCost.feeUsd + close.fillCost.gasUsd)) } : {}),
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

  async settleBundleConversion(params: BundleConversionParams): Promise<number> {
    return settleBacktestBundleConversion(
      {
        positions: this.positions, trades: this.trades, fillCosts: this.fillCosts,
        fillEquityCurve: this.fillEquityCurve, capital: this.capital,
        getCurrentEquity: () => this.currentEquity, setCurrentEquity: (next) => { this.currentEquity = next; },
        currentTimestampIso: this.currentTimestampIso, feeResolver: this.feeResolver,
      },
      params,
    );
  }

  getTrades(): BacktestTrade[] { return [...this.trades]; }
  getFillCosts(): FillCostDetail[] { return [...this.fillCosts]; }
  getEquityCurve(): Array<{ timestamp: string; equity: number }> {
    return this.equityCurve.length > 0 ? [...this.equityCurve] : [...this.fillEquityCurve];
  }

  getCurrentEquity(): number {
    if (this.markPrices.size === 0) return this.currentEquity;
    let unrealized = 0;
    for (const [tokenId, pos] of this.positions) {
      const mark = this.markPrices.get(tokenId);
      if (mark === undefined || !(mark > 0)) continue;
      unrealized += Math.abs(pos.size) * (mark - pos.avgPrice) * (pos.size > 0 ? 1 : -1);
    }
    return roundUsd(this.currentEquity + unrealized);
  }

  private computeClose(
    tokenId: string, side: 'BUY' | 'SELL', price: number, size: number,
    schedule?: PolymarketFeeSchedule | null, orderType?: BacktestLegOrderType,
  ): { pnl: number; closedSize: number; fillCost: FillCostDetail } | null {
    const existing = this.positions.get(tokenId);
    const direction = side === 'BUY' ? 1 : -1;
    if (existing !== undefined && existing.size * direction < 0) {
      return this.settleClose(tokenId, existing, price, size, schedule, orderType);
    }
    if (existing) {
      const openSize = Math.abs(existing.size) + size;
      this.positions.set(tokenId, {
        size: openSize * direction,
        avgPrice: (existing.avgPrice * Math.abs(existing.size) + price * size) / openSize,
        entryFills: existing.entryFills + 1,
        entryOrderType: orderType ?? existing.entryOrderType,
      });
    } else {
      this.positions.set(tokenId, { size: size * direction, avgPrice: price, entryFills: 1, entryOrderType: orderType });
    }
    return null;
  }

  private settleClose(
    tokenId: string, existing: OpenPosition, price: number, size: number,
    schedule?: PolymarketFeeSchedule | null, exitOrderType?: BacktestLegOrderType,
  ): { pnl: number; closedSize: number; fillCost: FillCostDetail } {
    const positionSign = existing.size > 0 ? 1 : -1;
    const openSize = existing.size * positionSign;
    const closeSize = Math.min(size, openSize);
    const grossPnlUsd = closeSize * (price - existing.avgPrice) * positionSign;
    const remaining = openSize - closeSize;
    const chargeEntryGas = remaining <= POSITION_DUST_EPSILON;
    if (chargeEntryGas) this.positions.delete(tokenId);
    else this.positions.set(tokenId, { ...existing, size: remaining * positionSign });
    const costs = applyVenueCosts(
      {
        price, entryPrice: existing.avgPrice, entryOrderType: existing.entryOrderType, exitOrderType,
        size: closeSize, grossPnl: grossPnlUsd, schedule,
        clobV2Category: this.feeOptions.clobV2Category, postOnly: this.feeOptions.postOnly,
      },
      1 + (chargeEntryGas ? existing.entryFills : 0),
    );
    return {
      pnl: costs.netPnl, closedSize: closeSize,
      fillCost: {
        grossPnlUsd: roundUsd(grossPnlUsd), feeUsd: costs.feeUsd,
        gasUsd: costs.gasUsd,
        ...(this.feeOptions.clobV2Category ? { rebateUsd: costs.rebateUsd } : {}),
        netPnlUsd: costs.netPnl,
      },
    };
  }
}
