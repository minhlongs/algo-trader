/**
 * Order Execution Order Placement and Rollback Helpers
 */

import { logger } from '../utils/logger';
import { ArbitrageOpportunity } from '../arbitrage/spread-detector';
import type { OrderResult } from './order-executor-types';

/**
 * Cancel order on the exchange API (mock implementation)
 */
export async function cancelOrder(exchange: string, orderId: string): Promise<boolean> {
  logger.info(`[OrderExecutor] Sending cancellation request to ${exchange} for order ${orderId}`);
  return true;
}

/**
 * Place single order (mock implementation)
 */
export async function placeOrder(params: {
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
}): Promise<OrderResult> {
  const orderId = `${params.exchange}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    orderId,
    exchange: params.exchange,
    symbol: params.symbol,
    side: params.side,
    price: params.price,
    amount: params.amount,
    filled: params.amount, // Assume full fill for mock
    remaining: 0,
    status: 'closed',
    fee: params.amount * params.price * 0.001, // 0.1% fee
  };
}

/**
 * Rollback order by placing an offsetting order or canceling if still open
 */
export async function rollbackOrder(order: OrderResult): Promise<void> {
  logger.warn(`[OrderExecutor] Rolling back order:`, { order });
  try {
    if (order.status === 'open') {
      const success = await cancelOrder(order.exchange, order.orderId);
      if (success) {
        order.status = 'canceled';
        logger.info(`[OrderExecutor] Canceled open order ${order.orderId} via exchange API`);
      } else {
        throw new Error(`Exchange API rejected cancellation for order ${order.orderId}`);
      }
    } else if (order.status === 'closed') {
      const oppositeSide = order.side === 'buy' ? 'sell' : 'buy';
      logger.info(`[OrderExecutor] Placing offsetting ${oppositeSide} order for ${order.amount} units`);
      await placeOrder({
        exchange: order.exchange,
        symbol: order.symbol,
        side: oppositeSide,
        price: order.price,
        amount: order.amount,
      });
    }
  } catch (err) {
    logger.error(`[OrderExecutor] Rollback failed for order ${order.orderId}:`, err);
  }
}

/**
 * Calculate profit after execution
 */
export function calculateProfit(opportunity: ArbitrageOpportunity, amount: number): number {
  const buyCost = opportunity.buyPrice * amount;
  const sellRevenue = opportunity.sellPrice * amount;
  const fees = (buyCost + sellRevenue) * 0.001; // 0.1% fee per side
  return sellRevenue - buyCost - fees;
}
