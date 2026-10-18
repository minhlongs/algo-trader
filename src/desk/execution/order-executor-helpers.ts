/**
 * Pure execution validation, fill assessment, profit calculation, and settlement helpers.
 */

import type { ArbitrageOpportunity } from '../arbitrage/spread-detector';
import type { ExecutionResult, OrderResult } from './order-executor-types';

const TERMINAL_STATUSES = new Set<ExecutionResult['status']>([
  'FILLED',
  'FAILED',
  'ROLLBACK',
  'CANCELED',
  'PARTIAL',
]);

export function createPendingExecution(opportunityId: string): ExecutionResult {
  return {
    id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    opportunityId,
    status: 'PENDING',
    timestamp: Date.now(),
  };
}

export function buildFilledOrderResult(params: {
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
}): OrderResult {
  const orderId = `${params.exchange}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    orderId,
    exchange: params.exchange,
    symbol: params.symbol,
    side: params.side,
    price: params.price,
    amount: params.amount,
    filled: params.amount,
    remaining: 0,
    status: 'closed',
    fee: params.amount * params.price * 0.001,
  };
}

export function calculateArbitrageProfit(
  opportunity: ArbitrageOpportunity,
  amount: number,
): number {
  const buyCost = opportunity.buyPrice * amount;
  const sellRevenue = opportunity.sellPrice * amount;
  return sellRevenue - buyCost - (buyCost + sellRevenue) * 0.001;
}

export function applyFillOutcome(
  execution: ExecutionResult,
  buyOrder: OrderResult,
  sellOrder: OrderResult,
  opportunity: ArbitrageOpportunity,
  execAmount: number,
): void {
  const buyFilled = buyOrder.filled / buyOrder.amount;
  const sellFilled = sellOrder.filled / sellOrder.amount;

  if (buyFilled >= 0.99 && sellFilled >= 0.99) {
    execution.status = 'FILLED';
    execution.profit = calculateArbitrageProfit(opportunity, execAmount);
  } else if (buyFilled > 0 || sellFilled > 0) {
    execution.status = 'PARTIAL';
  }
}

export async function handleFailedLegs(
  execution: ExecutionResult,
  buyOrder: OrderResult | null,
  sellOrder: OrderResult | null,
  buyError: Error | null,
  sellError: Error | null,
  rollbackOrder: (order: OrderResult) => Promise<void>,
): Promise<void> {
  const buyFailed = buyError || (buyOrder && buyOrder.status === 'rejected');
  const sellFailed = sellError || (sellOrder && sellOrder.status === 'rejected');
  if (!buyFailed && !sellFailed) return;

  if (!buyFailed && buyOrder) {
    await rollbackOrder(buyOrder);
    execution.status = 'ROLLBACK';
    const errMsg = sellError ? sellError.message : `Sell order rejected: ${sellOrder?.orderId}`;
    throw new Error(`Sell side failed (${errMsg}). Buy order rolled back.`);
  } else if (!sellFailed && sellOrder) {
    await rollbackOrder(sellOrder);
    execution.status = 'ROLLBACK';
    const errMsg = buyError ? buyError.message : `Buy order rejected: ${buyOrder?.orderId}`;
    throw new Error(`Buy side failed (${errMsg}). Sell order rolled back.`);
  } else {
    const buyMsg = buyError ? buyError.message : 'Buy order rejected';
    const sellMsg = sellError ? sellError.message : 'Sell order rejected';
    throw new Error(`Both sides failed. Buy: ${buyMsg}, Sell: ${sellMsg}`);
  }
}

export function isExpiredTerminalExecution(
  execution: ExecutionResult,
  now: number,
  ttlMs: number,
): boolean {
  return TERMINAL_STATUSES.has(execution.status) && now - execution.timestamp > ttlMs;
}
