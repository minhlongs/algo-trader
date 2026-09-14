import type { OrderResult } from './order-executor';
import type { RollbackResult } from './rollback-types';

export function buildCloseOrder(
  order: OrderResult,
  side: 'buy' | 'sell',
  slippageConfig: { longSlippage: number; shortSlippage: number },
  closeAmount: number
): OrderResult {
  const priceMultiplier = side === 'sell' ? slippageConfig.longSlippage : slippageConfig.shortSlippage;
  const price = order.price * priceMultiplier;
  return {
    orderId: `rollback-${order.orderId}`,
    exchange: order.exchange,
    symbol: order.symbol,
    side,
    price,
    amount: closeAmount,
    filled: closeAmount,
    remaining: 0,
    status: 'closed',
    fee: closeAmount * order.price * 0.001,
  };
}

export function calculateLoss(openOrder: OrderResult, closeOrder: OrderResult): number {
  const openValue = openOrder.price * openOrder.amount;
  const closeValue = closeOrder.price * closeOrder.amount;
  const fees = (openOrder.fee || 0) + (closeOrder.fee || 0);

  if (openOrder.side === 'buy') {
    return closeValue - openValue - fees;
  } else {
    return openValue - closeValue - fees;
  }
}

export function buildRollbackResult(
  action: RollbackResult['action'],
  loss: number,
  reason: string,
  maxLossPercent: number
): RollbackResult {
  const success = loss >= -maxLossPercent;
  const finalReason = success ? reason : `${reason} (Loss ${loss.toFixed(2)} exceeds max ${maxLossPercent}%)`;

  return {
    success,
    action,
    loss,
    reason: finalReason,
    timestamp: Date.now(),
  };
}
