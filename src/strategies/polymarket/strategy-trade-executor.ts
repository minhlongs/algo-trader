/**
 * Shared trade execution for Polymarket strategies.
 * Wraps orderManager.placeOrder + eventBus.emit into reusable entry/exit functions.
 * Eliminates ~60 lines of duplicated order+event code per strategy file.
 */

import type { OrderManager } from '../../polymarket/order-manager.js';
import type { EventBus } from '../../events/event-bus.js';
import type { StrategyName } from '../../core/types.js';
import { logger } from '../../core/logger.js';
import { calcShareSize } from './strategy-orderbook-helpers.js';

export interface EntryOrderParams {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  strategyName: StrategyName;
  /** Extra log fields */
  logExtra?: Record<string, unknown>;
}

export interface EntryOrderResult {
  orderId: string;
  openedAt: number;
}

/** Place an entry order and emit trade.executed event. */
export async function placeEntryOrder(
  orderManager: OrderManager,
  eventBus: EventBus,
  params: EntryOrderParams,
): Promise<EntryOrderResult> {
  const { tokenId, conditionId, side, entryPrice, sizeUsdc, strategyName, logExtra } = params;

  const order = await orderManager.placeOrder({
    tokenId,
    side: 'buy',
    price: entryPrice.toFixed(4),
    size: String(calcShareSize(sizeUsdc, entryPrice)),
    orderType: 'GTC',
  });

  const openedAt = Date.now();

  logger.info('Entry position', strategyName, {
    conditionId,
    side,
    entryPrice: entryPrice.toFixed(4),
    size: sizeUsdc,
    ...logExtra,
  });

  eventBus.emit('trade.executed', {
    trade: {
      orderId: order.id,
      marketId: conditionId,
      side: 'buy',
      fillPrice: String(entryPrice),
      fillSize: String(sizeUsdc),
      fees: '0',
      timestamp: openedAt,
      strategy: strategyName,
    },
  });

  return { orderId: order.id, openedAt };
}

export interface ExitOrderParams {
  tokenId: string;
  conditionId: string;
  orderId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  currentPrice: number;
  reason: string;
  strategyName: StrategyName;
}

/** Place an exit order, log P&L, and emit trade.executed event. */
export async function placeExitOrder(
  orderManager: OrderManager,
  eventBus: EventBus,
  params: ExitOrderParams,
): Promise<void> {
  const { tokenId, conditionId, orderId, side, entryPrice, sizeUsdc, currentPrice, reason, strategyName } = params;
  const exitSide = side === 'yes' ? 'sell' : 'buy';

  await orderManager.placeOrder({
    tokenId,
    side: exitSide,
    price: currentPrice.toFixed(4),
    size: String(calcShareSize(sizeUsdc, currentPrice)),
    orderType: 'IOC',
  });

  const pnl = side === 'yes'
    ? (currentPrice - entryPrice) * (sizeUsdc / entryPrice)
    : (entryPrice - currentPrice) * (sizeUsdc / entryPrice);

  logger.info('Exit position', strategyName, {
    conditionId,
    side,
    pnl: pnl.toFixed(4),
    reason,
  });

  eventBus.emit('trade.executed', {
    trade: {
      orderId,
      marketId: conditionId,
      side: exitSide,
      fillPrice: String(currentPrice),
      fillSize: String(sizeUsdc),
      fees: '0',
      timestamp: Date.now(),
      strategy: strategyName,
    },
  });
}
