/**
 * Dry-Run Position Tracker Math & Mutations
 * In-place position mutators and account factory
 */

import type { DryRunConfig, PaperAccount, PaperPosition } from './dry-run-position-types';

export function createDefaultAccount(config: DryRunConfig, initialBalance?: number): PaperAccount {
  return {
    balance: initialBalance || config.initialBalance,
    equity: initialBalance || config.initialBalance,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
  };
}

/** Add to or create a position (averages entry price). Mutates the array in-place. */
export function updatePositionInPlace(
  positions: PaperPosition[],
  symbol: string,
  side: 'long' | 'short',
  quantity: number,
  entryPrice: number,
  currentPrice: number,
): void {
  const existing = positions.find(p => p.symbol === symbol && p.side === side);
  if (existing) {
    const totalQuantity = existing.quantity + quantity;
    const avgPrice = ((existing.quantity * existing.entryPrice) + (quantity * entryPrice)) / totalQuantity;
    existing.quantity = totalQuantity;
    existing.entryPrice = avgPrice;
    existing.currentPrice = currentPrice;
    existing.unrealizedPnl = (currentPrice - avgPrice) * totalQuantity;
  } else {
    positions.push({
      symbol, side, quantity, entryPrice, currentPrice,
      unrealizedPnl: (currentPrice - entryPrice) * quantity,
      openedAt: Date.now(),
    });
  }
}

/** Reduce or remove a position after a partial/full close. Mutates array in-place. */
export function reducePositionInPlace(
  positions: PaperPosition[],
  symbol: string,
  quantity: number,
  currentPrice: number,
): void {
  const position = positions.find(p => p.symbol === symbol);
  if (!position) return;

  position.quantity -= quantity;
  position.currentPrice = currentPrice;
  position.unrealizedPnl = (currentPrice - position.entryPrice) * position.quantity;

  if (position.quantity <= 0) {
    const index = positions.indexOf(position);
    if (index > -1) positions.splice(index, 1);
  }
}

/** Mark-to-market: update all position prices. Mutates array in-place. */
export function updatePositionsPrices(
  positions: PaperPosition[],
  prices: Map<string, number>,
): void {
  for (const position of positions) {
    if (prices.has(position.symbol)) {
      position.currentPrice = prices.get(position.symbol)!;
      position.unrealizedPnl = (position.currentPrice - position.entryPrice) * position.quantity;
    }
  }
}
