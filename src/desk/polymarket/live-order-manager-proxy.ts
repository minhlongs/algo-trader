/**
 * Live Order Manager Proxy
 *
 * Implements the legacy OrderManager interface but routes all orders through
 * the LiveTradingOrchestrator via StrategyLiveBridge. This allows existing
 * V2 strategies to use the live trading pipeline without code changes —
 * just swap the OrderManager dependency.
 *
 * Usage:
 *   const orch = new LiveTradingOrchestrator({ paperTrading: false, ... });
 *   const bridge = new StrategyLiveBridge(orch);
 *   const orderMgr = new LiveOrderManagerProxy(bridge, 'my-strategy');
 *   // Pass orderMgr as a StrategyDeps.orderManager to any V2 strategy
 */

import type { OrderManager, PlaceOrderResult } from '../polymarket/order-manager';
import type { StrategyLiveBridge, TradeSignal } from './strategy-live-bridge';
import { logger } from '../../shared/utils/logger';

// ── Proxy ────────────────────────────────────────────────────────────────────────

export class LiveOrderManagerProxy implements OrderManager {
  private bridge: StrategyLiveBridge;
  private strategyName: string;
  private orderCount = 0;
  private cancelCount = 0;

  constructor(bridge: StrategyLiveBridge, strategyName: string) {
    this.bridge = bridge;
    this.strategyName = strategyName;
  }

  // ── OrderManager interface ──────────────────────────────────────────────────

  async placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string | number;
    size: string | number;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  }): Promise<PlaceOrderResult> {
    this.orderCount++;
    const priceNum = parseFloat(String(params.price));
    const sizeNum = parseFloat(String(params.size));

    const signal: TradeSignal = {
      tokenId: params.tokenId,
      side: params.side === 'buy' ? 'BUY' : 'SELL',
      price: priceNum,
      size: sizeNum,
      orderType: params.orderType,
      description: `${this.strategyName}:order#${this.orderCount}`,
      confidence: 0.7,
      timestamp: Date.now(),
    };

    const result = await this.bridge.onSignal(signal);

    if (result.error && !result.rejected) {
      throw new Error(`Order failed: ${result.error}`);
    }

    if (result.rejected) {
      throw new Error(`Order rejected: ${result.rejectReason}`);
    }

    const orderId = result.response?.orderID ?? `proxy-${Date.now()}-${this.orderCount}`;

    logger.debug('Order routed via proxy', 'LiveOrderManagerProxy', {
      strategy: this.strategyName,
      tokenId: params.tokenId.slice(0, 12),
      side: params.side,
      orderId,
    });

    if (result.response?.status === 'matched') {
      const filledSizeNum =
        typeof result.response.filledSize === 'number' ? result.response.filledSize : sizeNum;
      const fillPriceNum =
        typeof result.response.fillPrice === 'number' ? result.response.fillPrice : priceNum;
      // The proxy holds no token-resolved fee schedule, so a response that omits
      // its fee is booked at no fee rather than priced from a category guess.
      const feeUsdc = typeof result.response.feeUsdc === 'number' ? result.response.feeUsdc : 0;
      return {
        id: orderId,
        filled: filledSizeNum > 0,
        filledSize: String(filledSizeNum),
        fillPrice: String(fillPriceNum),
        fees: feeUsdc.toFixed(6),
      };
    }

    if (result.response?.status === 'unmatched') {
      return {
        id: orderId,
        filled: false,
        filledSize: '0',
        fillPrice: '0',
        fees: '0.000000',
      };
    }

    return { id: orderId };
  }

  async cancelOrder(orderId: string): Promise<void> {
    this.cancelCount++;
    logger.debug('Cancelling order', 'LiveOrderManagerProxy', {
      strategy: this.strategyName,
      orderId,
    });
    await this.bridge.cancelOrder(orderId);
  }

  async cancelAllOrders(tokenId?: string): Promise<void> {
    this.cancelCount++;
    logger.debug('Cancel all orders', 'LiveOrderManagerProxy', {
      strategy: this.strategyName,
      tokenId: tokenId?.slice(0, 12),
    });
    await this.bridge.cancelAllOrders(tokenId);
  }

  async getOpenOrders(tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>> {
    return this.bridge.getOpenOrders(tokenId);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  getStats() {
    return {
      strategy: this.strategyName,
      ordersPlaced: this.orderCount,
      cancelsRequested: this.cancelCount,
      bridgeStats: this.bridge.getStats(),
    };
  }
}
