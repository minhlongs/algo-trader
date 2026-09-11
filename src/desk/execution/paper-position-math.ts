/**
 * Paper Position Math
 * Pure functions for position upsert, reduction, and mark-to-market pricing.
 * No side effects — caller is responsible for persistence.
 */

import type { PaperPosition } from './paper-position-types';

/** Add to or create a position (averages entry price) */
export function upsertPosition(
  positions: PaperPosition[],
  symbol: string,
  side: 'long' | 'short',
  quantity: number,
  entryPrice: number,
  currentPrice: number,
): PaperPosition[] {
  const existing = positions.find((p) => p.symbol === symbol && p.side === side);
  if (existing) {
    const totalQty = existing.quantity + quantity;
    existing.entryPrice =
      (existing.quantity * existing.entryPrice + quantity * entryPrice) / totalQty;
    existing.quantity = totalQty;
    existing.currentPrice = currentPrice;
    existing.unrealizedPnl = (currentPrice - existing.entryPrice) * totalQty;
    return positions;
  }
  return [
    ...positions,
    {
      symbol,
      side,
      quantity,
      entryPrice,
      currentPrice,
      unrealizedPnl: (currentPrice - entryPrice) * quantity,
      openedAt: Date.now(),
    },
  ];
}

/** Reduce or remove a position after a partial/full close */
export function reducePosition(
  positions: PaperPosition[],
  symbol: string,
  quantity: number,
  currentPrice: number,
): PaperPosition[] {
  const pos = positions.find((p) => p.symbol === symbol);
  if (!pos) return positions;
  pos.quantity -= quantity;
  pos.currentPrice = currentPrice;
  pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.quantity;
  if (pos.quantity <= 0.0001) {
    return positions.filter((p) => p.symbol !== symbol);
  }
  return positions;
}

/** Mark-to-market: update all position prices */
export function updatePositionsPrices(
  positions: PaperPosition[],
  prices: Map<string, number>,
): PaperPosition[] {
  for (const pos of positions) {
    if (prices.has(pos.symbol)) {
      pos.currentPrice = prices.get(pos.symbol)!;
      pos.unrealizedPnl = (pos.currentPrice - pos.entryPrice) * pos.quantity;
    }
  }
  return positions;
}
