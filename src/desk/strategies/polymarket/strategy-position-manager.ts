/**
 * Shared position management for Polymarket strategies.
 * Handles exit checks (TP/SL/timeout), cooldown tracking, and position lifecycle.
 */

import type { BaseOpenPosition } from './strategy-shared-types.js';
import { logger } from '../../../core/logger.js';

/** Check if position should exit based on take-profit */
export function shouldTakeProfit(
  entryPrice: number,
  currentPrice: number,
  side: 'yes' | 'no',
  tpPct: number,
): boolean {
  if (side === 'yes') return currentPrice >= entryPrice * (1 + tpPct);
  return currentPrice <= entryPrice * (1 - tpPct);
}

/** Check if position should exit based on stop-loss */
export function shouldStopLoss(
  entryPrice: number,
  currentPrice: number,
  side: 'yes' | 'no',
  slPct: number,
): boolean {
  if (side === 'yes') return currentPrice <= entryPrice * (1 - slPct);
  return currentPrice >= entryPrice * (1 + slPct);
}

/** Check if position has exceeded max hold time */
export function isExpired(openedAt: number, maxHoldMs: number): boolean {
  return Date.now() - openedAt > maxHoldMs;
}

/** Check if market is in cooldown period */
export function isInCooldown(
  lastTradeTime: number | undefined,
  cooldownMs: number,
): boolean {
  if (!lastTradeTime) return false;
  return Date.now() - lastTradeTime < cooldownMs;
}

/** Calculate unrealized P&L for a position */
export function calcUnrealizedPnl(
  position: BaseOpenPosition,
  currentPrice: number,
): number {
  const priceDiff = position.side === 'yes'
    ? currentPrice - position.entryPrice
    : position.entryPrice - currentPrice;
  return priceDiff * (position.sizeUsdc / position.entryPrice);
}

/** Log position exit with reason */
export function logPositionExit(
  strategyName: string,
  position: BaseOpenPosition,
  reason: 'tp' | 'sl' | 'timeout' | 'signal' | 'regime-shift',
  currentPrice: number,
): void {
  const pnl = calcUnrealizedPnl(position, currentPrice);
  logger.info(
    `[${strategyName}] EXIT ${position.side.toUpperCase()} ` +
    `${position.tokenId.slice(0, 8)}… reason=${reason} ` +
    `entry=${position.entryPrice.toFixed(4)} exit=${currentPrice.toFixed(4)} ` +
    `pnl=${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDC`,
  );
}

/** Manage position exits — returns positions to close */
export function checkPositionExits<T extends BaseOpenPosition>(
  positions: T[],
  getCurrentPrice: (pos: T) => number,
  opts: {
    tpPct: number;
    slPct: number;
    maxHoldMs: number;
    strategyName: string;
  },
): { toClose: T[]; toKeep: T[] } {
  const toClose: T[] = [];
  const toKeep: T[] = [];

  for (const pos of positions) {
    const price = getCurrentPrice(pos);
    let reason: 'tp' | 'sl' | 'timeout' | null = null;

    if (shouldTakeProfit(pos.entryPrice, price, pos.side, opts.tpPct)) {
      reason = 'tp';
    } else if (shouldStopLoss(pos.entryPrice, price, pos.side, opts.slPct)) {
      reason = 'sl';
    } else if (isExpired(pos.openedAt, opts.maxHoldMs)) {
      reason = 'timeout';
    }

    if (reason) {
      logPositionExit(opts.strategyName, pos, reason, price);
      toClose.push(pos);
    } else {
      toKeep.push(pos);
    }
  }

  return { toClose, toKeep };
}
