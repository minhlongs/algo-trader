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

/** Place a GTC entry order, record the position, log and emit the trade. */
export async function performEntry(
  ctx: TradeLifecycleContext,
  tokenId: string,
  conditionId: string,
  side: 'yes' | 'no',
  entryPrice: number,
  sizeUsdc: number,
): Promise<void> {
  const order = await ctx.deps.orderManager.placeOrder({
    tokenId,
    side: 'buy',
    price: entryPrice.toFixed(4),
    size: String(Math.round(sizeUsdc / entryPrice)),
    orderType: 'GTC',
  });

  ctx.positions.push({ tokenId, conditionId, side, entryPrice, sizeUsdc, orderId: order.id, openedAt: Date.now() });

  logger.info('Entry position', ctx.strategyName, {
    conditionId,
    side,
    entryPrice: entryPrice.toFixed(4),
    size: sizeUsdc.toFixed(2),
  });

  ctx.emitTrade({
    orderId: order.id,
    marketId: conditionId,
    side: 'buy',
    fillPrice: String(entryPrice),
    fillSize: String(sizeUsdc),
    fees: '0',
    timestamp: Date.now(),
    strategy: ctx.strategyName,
  });
}

/** Place an IOC exit order, log pnl, emit the trade, set cooldown. Swallows errors (logged). */
export async function performExit(
  ctx: TradeLifecycleContext,
  pos: OpenPosition,
  currentPrice: number,
  reason: string,
): Promise<void> {
  try {
    const exitSide = pos.side === 'yes' ? 'sell' : 'buy';
    await ctx.deps.orderManager.placeOrder({
      tokenId: pos.tokenId,
      side: exitSide,
      price: currentPrice.toFixed(4),
      size: String(Math.round(pos.sizeUsdc / currentPrice)),
      orderType: 'IOC',
    });

    const pnl = computeExitPnl(pos, currentPrice);

    logger.info('Exit position', ctx.strategyName, {
      conditionId: pos.conditionId,
      side: pos.side,
      pnl: pnl.toFixed(4),
      reason,
    });

    ctx.emitTrade({
      orderId: pos.orderId,
      marketId: pos.conditionId,
      side: exitSide,
      fillPrice: String(currentPrice),
      fillSize: String(pos.sizeUsdc),
      fees: '0',
      timestamp: Date.now(),
      strategy: ctx.strategyName,
    });

    ctx.setCooldown(pos.conditionId);
  } catch (err) {
    logger.warn('Exit failed', ctx.strategyName, { tokenId: pos.tokenId, err: String(err) });
  }
}
