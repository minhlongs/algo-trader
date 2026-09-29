/**
 * Polymarket Order Fetcher
 * Implements 3-tier status resolution: terminal cache -> LiveOrderManager -> CLOB open orders.
 */

import {
  type ExchangeOrderResult,
  OrderNotFoundError,
} from '../arbitrage/connectors/types';
import type { PolymarketAdapter } from './polymarket-adapter';
import type { LiveOrderManager } from './live-order-manager';
import type { PolymarketTerminalCache } from './polymarket-terminal-cache';
import { mapOpenOrder, mapLiveOrderStateStatus } from './polymarket-connector-mappers';
import { logger } from '../../shared/utils/logger';

export async function fetchPolymarketOrder(
  orderId: string,
  adapter: PolymarketAdapter,
  cache: PolymarketTerminalCache,
  liveOrderManager?: LiveOrderManager
): Promise<ExchangeOrderResult> {
  if (!orderId) throw new OrderNotFoundError('orderId is required', 'polymarket');

  const cached = cache.getTerminalOrder(orderId);
  if (cached) return cached;

  if (liveOrderManager) {
    const activeState = liveOrderManager.getOrder(orderId);
    if (activeState) {
      const status = mapLiveOrderStateStatus(activeState.status);
      const filled = status === 'closed' ? activeState.size : 0;
      const remaining = status === 'closed' ? 0 : activeState.size;
      const clientOrderId = cache.getClientOrderId(orderId);

      const res: ExchangeOrderResult = {
        orderId: activeState.orderId,
        clientOrderId,
        exchange: 'polymarket',
        symbol: activeState.tokenId,
        side: activeState.side.toLowerCase() as 'buy' | 'sell',
        price: activeState.price,
        amount: activeState.size,
        filled,
        remaining,
        status,
        fee: { amount: 0, currency: 'USDC' },
        timestamp: activeState.submittedAt,
      };

      if (status === 'closed' || status === 'canceled' || status === 'expired') {
        cache.setTerminalOrder(orderId, res);
      }
      return res;
    }
  }

  try {
    const openOrders = await adapter.getOpenOrders();
    const openOrder = openOrders.find((o) => o.id === orderId);

    if (openOrder) {
      const mapped = mapOpenOrder('polymarket', openOrder);
      const resWithCoid: ExchangeOrderResult = {
        ...mapped,
        clientOrderId: cache.getClientOrderId(orderId) ?? mapped.clientOrderId,
      };
      if (resWithCoid.status === 'closed') {
        cache.setTerminalOrder(orderId, resWithCoid);
      }
      return resWithCoid;
    }
  } catch (err) {
    logger.warn(`[polymarket] getOpenOrders failed during fetchOrder: ${String(err)}`);
  }

  throw new OrderNotFoundError(orderId, 'polymarket');
}
