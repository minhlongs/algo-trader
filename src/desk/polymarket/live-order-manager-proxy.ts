/**
 * Live Order Manager Proxy
 *
 * Implements the legacy OrderManager interface and routes all orders through
 * LiveTradingOrchestrator via StrategyLiveBridge.
 */

import type { OrderManager, PlaceOrderResult } from '../polymarket/order-manager';
import type { StrategyLiveBridge, TradeSignal } from './strategy-live-bridge';
import { calcQuadraticTakerFeeRateV2, type PolymarketCategory } from './polymarket-fee-calculator';
import { logger } from '../../shared/utils/logger';

export class LiveOrderManagerProxy implements OrderManager {
  private bridge: StrategyLiveBridge;
  private strategyName: string;
  private orderCount = 0;
  private cancelCount = 0;

  constructor(bridge: StrategyLiveBridge, strategyName: string) {
    this.bridge = bridge;
    this.strategyName = strategyName;
  }

  async placeOrder(params: {
    tokenId: string;
    side: 'buy' | 'sell';
    price: string | number;
    size: string | number;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
    /** Optional CLOB V2 market category when response omits `feeUsdc`. */
    category?: PolymarketCategory;
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
      const feeUsdc =
        typeof result.response.feeUsdc === 'number'
          ? result.response.feeUsdc
          : params.category
            ? calcQuadraticTakerFeeRateV2(params.category, fillPriceNum) * filledSizeNum * fillPriceNum
            : 0;
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

  getStats() {
    return {
      strategy: this.strategyName,
      ordersPlaced: this.orderCount,
      cancelsRequested: this.cancelCount,
      bridgeStats: this.bridge.getStats(),
    };
  }
}
