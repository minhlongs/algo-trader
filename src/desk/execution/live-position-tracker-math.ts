/**
 * Pure calculation functions for Live Position Tracker
 */

import type { LivePosition } from './live-position-tracker-types';

export function computeUnrealizedPnl(
  pos: Pick<LivePosition, 'side' | 'currentPrice' | 'entryPrice' | 'size'>
): number {
  if (pos.side === 'BUY') {
    return (pos.currentPrice - pos.entryPrice) * pos.size;
  }
  return (pos.entryPrice - pos.currentPrice) * pos.size;
}

export function computeClosePnl(
  pos: Pick<LivePosition, 'side' | 'entryPrice' | 'size'>,
  exitPrice: number
): number {
  if (pos.side === 'BUY') {
    return (exitPrice - pos.entryPrice) * pos.size;
  }
  return (pos.entryPrice - exitPrice) * pos.size;
}

export function computeVwapEntry(
  existingSize: number,
  existingPrice: number,
  fillSize: number,
  fillPrice: number
): number {
  const totalSize = existingSize + fillSize;
  if (totalSize === 0) return 0;
  return (existingPrice * existingSize + fillPrice * fillSize) / totalSize;
}

export function createLivePosition(
  tokenId: string,
  side: 'BUY' | 'SELL',
  size: number,
  price: number,
  openedAt: number = Date.now()
): LivePosition {
  return {
    tokenId,
    side,
    size,
    entryPrice: price,
    currentPrice: price,
    unrealizedPnl: 0,
    openedAt,
    lastPriceUpdate: Date.now(),
  };
}
