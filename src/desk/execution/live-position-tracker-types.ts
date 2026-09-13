/**
 * Live Position Tracker Types
 */

export interface LivePosition {
  /** YES or NO outcome token ID (0x-prefixed hex) */
  tokenId: string;
  /** BUY or SELL */
  side: 'BUY' | 'SELL';
  /** Token amount held */
  size: number;
  /** Volume-weighted average entry price */
  entryPrice: number;
  /** Current mark price (midpoint from orderbook) */
  currentPrice: number;
  /** (currentPrice - entryPrice) * size for BUY; (entryPrice - currentPrice) * size for SELL */
  unrealizedPnl: number;
  /** Unix ms when position was opened */
  openedAt: number;
  /** Unix ms of last price update */
  lastPriceUpdate: number;
}

export interface FilledOrder {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  filledAt: number; // unix ms
  orderId: string;
}

export interface PositionSummary {
  positionCount: number;
  totalExposure: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  /** Fraction of capital currently exposed */
  exposureFraction: number;
}
