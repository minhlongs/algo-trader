/**
 * Polymarket Connector Mappers
 * Mapping helpers between Polymarket CLOB schemas, LiveOrderManager states, and unified exchange models.
 */

import {
  type ExchangeOrderResult,
  type ExchangeOrderStatus,
} from '../arbitrage/connectors/types';
import type { PolymarketOpenOrder } from './polymarket-adapter';

export function mapOpenOrder(
  exchangeId: 'polymarket',
  order: PolymarketOpenOrder
): ExchangeOrderResult {
  const originalSize = parseFloat(order.original_size) || 0;
  const sizeMatched = parseFloat(order.size_matched) || 0;
  const remaining = Math.max(0, originalSize - sizeMatched);
  const price = parseFloat(order.price) || 0;
  const status: ExchangeOrderStatus = remaining === 0 ? 'closed' : 'open';

  return {
    orderId: order.id,
    exchange: exchangeId,
    symbol: order.asset_id,
    side: order.side.toLowerCase() as 'buy' | 'sell',
    price,
    amount: originalSize,
    filled: sizeMatched,
    remaining,
    status,
    fee: { amount: 0, currency: 'USDC' },
    timestamp: order.created_at ? new Date(order.created_at).getTime() : Date.now(),
  };
}

export function mapLiveOrderStateStatus(status: string): ExchangeOrderStatus {
  if (status === 'matched') return 'closed';
  if (status === 'canceled') return 'canceled';
  if (status === 'expired') return 'expired';
  if (status === 'error') return 'rejected';
  return 'open';
}
