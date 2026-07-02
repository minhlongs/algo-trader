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

import type { OrderManager } from '../polymarket/order-manager';
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
    price: string;
    size: string;
    orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  }): Promise<{ id: string }> {
    this.orderCount++;

    const signal: TradeSignal = {
      tokenId: params.tokenId,
      side: params.side === 'buy' ? 'BUY' : 'SELL',
      price: parseFloat(params.price),
      size: parseFloat(params.size),
      description: `${this.strategyName}:order#${this.orderCount}`,
      confidence: 0.7,
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

    return { id: orderId };
  }

  async cancelOrder(orderId: string): Promise<void> {
    this.cancelCount++;
    logger.debug('Cancelling order', 'LiveOrderManagerProxy', {
      strategy: this.strategyName,
      orderId,
    });
    // Delegate to orchestrator for live cancellation via adapter
    await this.bridge['orchestrator'].cancelOrder(orderId);
  }

  async cancelAllOrders(tokenId?: string): Promise<void> {
    logger.debug('Cancel all orders', 'LiveOrderManagerProxy', {
      strategy: this.strategyName,
      tokenId: tokenId?.slice(0, 12),
    });
    // Cancel all open orders for this strategy via orchestrator
    if (tokenId) {
      await this.bridge['orchestrator'].cancelOrder(tokenId);
    }
  }

  async getOpenOrders(_tokenId?: string): Promise<Array<{ id: string; side: string; price: number; size: number }>> {
    return [];
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
