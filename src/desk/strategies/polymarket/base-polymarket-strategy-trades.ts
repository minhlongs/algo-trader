/**
 * Trade lifecycle (entry/exit execution) for BasePolymarketStrategy.
 * Extracted from base-polymarket-strategy.ts enterPosition()/exitPosition() —
 * behavior identical. The class keeps thin protected delegates so subclass
 * call sites (this.enterPosition / this.exitPosition) are unchanged.
 */

import type { StrategyName } from '../../core/types';
import type { OpenPosition, StrategyDeps, TradeEvent } from './base-polymarket-strategy-types';
import { computeExitPnl } from './base-polymarket-strategy-exits';
import { logger } from '../../core/logger';

/** Runtime context passed in by the class — no `this` reference leaves the class. */
export interface TradeLifecycleContext {
  deps: StrategyDeps;
  positions: OpenPosition[];
  strategyName: StrategyName;
  emitTrade: (trade: TradeEvent) => void;
  setCooldown: (conditionId: string) => void;
}

/**
 * Place a GTC entry order.
 *
 * The position is recorded, and the trade event emitted, only once the venue
 * confirms a fill. A resting GTC order returns an order id with no confirmed
 * fill; recording a position or emitting a fill event for it would fabricate
 * an executed entry. Throws on an unfilled entry so no caller can mistake a
 * resting order for an open position.
 */
export async function performEntry(
  ctx: TradeLifecycleContext,
  tokenId: string,
  conditionId: string,
  side: 'yes' | 'no',
  entryPrice: number,
  sizeUsdc: number,
): Promise<void> {
  const requestedQuantity = Math.round(sizeUsdc / entryPrice);
  if (requestedQuantity <= 0) {
    throw new Error(`Invalid entry: ${sizeUsdc} USDC at ${entryPrice} does not buy any tokens`);
  }

  // YES and NO are distinct ERC-1155 tokens, so entering a NO position is a BUY
  // of the NO token — never a sell, and never a buy of the YES token.
  const order = await ctx.deps.orderManager.placeOrder({
    tokenId,
    side: 'buy',
    price: entryPrice.toFixed(4),
    size: String(requestedQuantity),
    orderType: 'GTC',
  });

  if (order.filled === false) {
    logger.warn('Entry order resting, not filled', ctx.strategyName, {
      conditionId,
      tokenId,
      orderId: order.id,
    });
    throw new Error(`Entry order ${order.id} was submitted but no fill was confirmed`);
  }

  // Prefer the venue-confirmed fill quantity and price over the requested ones.
  const tokenQuantity = order.filledSize !== undefined
    ? Math.round(parseFloat(order.filledSize))
    : requestedQuantity;
  const fillPrice = order.fillPrice !== undefined ? parseFloat(order.fillPrice) : entryPrice;
  if (tokenQuantity <= 0) {
    logger.warn('Entry filled with zero tokens', ctx.strategyName, { conditionId, orderId: order.id });
    throw new Error(`Entry order ${order.id} filled with zero tokens`);
  }

  ctx.positions.push({
    tokenId,
    conditionId,
    side,
    entryPrice: fillPrice,
    sizeUsdc,
    tokenQuantity,
    orderId: order.id,
    openedAt: Date.now(),
  });

  logger.info('Entry position', ctx.strategyName, {
    conditionId,
    side,
    entryPrice: fillPrice.toFixed(4),
    sizeUsdc: sizeUsdc.toFixed(2),
    tokenQuantity,
  });

  ctx.emitTrade({
    orderId: order.id,
    marketId: conditionId,
    side: 'buy',
    fillPrice: fillPrice.toFixed(4),
    fillSize: sizeUsdc.toFixed(2),
    fees: '0',
    timestamp: Date.now(),
    strategy: ctx.strategyName,
  });
}

/**
 * Place an IOC exit order, log pnl, emit the trade, set cooldown.
 *
 * Does NOT swallow errors: an exit that fails to reach the venue, or reaches it
 * without a confirmed fill, propagates so the caller keeps the position and the
 * remaining exposure is preserved rather than silently dropped.
 */
export async function performExit(
  ctx: TradeLifecycleContext,
  pos: OpenPosition,
  currentPrice: number,
  reason: string,
): Promise<void> {
  // The entry bought whichever token was targeted, so the exit always sells that
  // same token — including a NO position. Sizing comes from the token quantity
  // acquired at entry, not from a quantity re-derived at the current exit price.
  const exitSide = 'sell';
  const exitTokenQuantity = pos.tokenQuantity;
  if (exitTokenQuantity <= 0) {
    throw new Error(`Cannot exit position on ${pos.tokenId}: recorded token quantity is not positive`);
  }

  const order = await ctx.deps.orderManager.placeOrder({
    tokenId: pos.tokenId,
    side: exitSide,
    price: currentPrice.toFixed(4),
    size: String(exitTokenQuantity),
    orderType: 'IOC',
  });

  if (order.filled === false) {
    logger.warn('Exit order not filled', ctx.strategyName, {
      conditionId: pos.conditionId,
      tokenId: pos.tokenId,
      orderId: order.id,
    });
    throw new Error(`Exit order ${order.id} was submitted but no fill was confirmed`);
  }

  const fillPrice = order.fillPrice !== undefined ? parseFloat(order.fillPrice) : currentPrice;
  const filledTokens = order.filledSize !== undefined
    ? Math.round(parseFloat(order.filledSize))
    : exitTokenQuantity;

  const pnl = computeExitPnl(pos, fillPrice);

  logger.info('Exit position', ctx.strategyName, {
    conditionId: pos.conditionId,
    side: pos.side,
    pnl: pnl.toFixed(4),
    reason,
    filledTokens,
  });

  ctx.emitTrade({
    orderId: order.id,
    marketId: pos.conditionId,
    side: exitSide,
    fillPrice: fillPrice.toFixed(4),
    fillSize: (filledTokens * fillPrice).toFixed(2),
    fees: '0',
    timestamp: Date.now(),
    strategy: ctx.strategyName,
  });

  ctx.setCooldown(pos.conditionId);
}
