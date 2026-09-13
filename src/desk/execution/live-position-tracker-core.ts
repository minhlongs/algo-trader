/**
 * Live Position Tracker Core Implementation
 */

import { logger } from '../../shared/utils/logger';
import {
  recordTrade,
  dailyPnlUsd,
  winRatePercent,
} from '../../platform/middleware/prometheus-metrics';
import type {
  LivePosition,
  FilledOrder,
  PositionSummary,
} from './live-position-tracker-types';
import {
  computeUnrealizedPnl,
  computeClosePnl,
  computeVwapEntry,
  createLivePosition,
} from './live-position-tracker-math';

export class LivePositionTracker {
  private positions = new Map<string, LivePosition>();
  private realizedPnl = 0;
  private filledOrders: FilledOrder[] = [];
  private readonly capitalUsdc: number;

  constructor(capitalUsdc: number = 1000) {
    this.capitalUsdc = capitalUsdc;
  }

  /** Record a filled order — opens or adds to a position */
  recordFill(fill: FilledOrder): void {
    this.filledOrders.push(fill);

    const existing = this.positions.get(fill.tokenId);

    if (existing && existing.side === fill.side) {
      // Add to existing position — recalculate VWAP entry
      const totalSize = existing.size + fill.size;
      existing.entryPrice = computeVwapEntry(existing.size, existing.entryPrice, fill.size, fill.price);
      existing.size = totalSize;
      existing.unrealizedPnl = computeUnrealizedPnl(existing);
      logger.debug('Position increased', 'LivePositionTracker', {
        tokenId: fill.tokenId.slice(0, 12),
        newSize: totalSize,
        avgEntry: existing.entryPrice.toFixed(4),
      });
    } else if (existing && existing.side !== fill.side) {
      // Opposite side — reduce or flip position
      if (fill.size >= existing.size) {
        // Full close + potential flip
        const closePnl = computeClosePnl(existing, fill.price);
        this.realizedPnl += closePnl;
        recordTrade(fill.tokenId, 'polymarket', fill.side.toLowerCase() as 'buy' | 'sell', closePnl);
        dailyPnlUsd.set({ strategy: 'live' }, this.realizedPnl);
        const remaining = fill.size - existing.size;
        if (remaining > 0) {
          // Flipped — create new position on opposite side
          this.positions.set(fill.tokenId, createLivePosition(fill.tokenId, fill.side, remaining, fill.price));
        } else {
          this.positions.delete(fill.tokenId);
        }
        logger.info('Position closed', 'LivePositionTracker', {
          tokenId: fill.tokenId.slice(0, 12),
          realizedPnl: closePnl.toFixed(2),
          flipped: remaining > 0,
        });
      } else {
        // Partial close
        const closePnl = (fill.price - existing.entryPrice) * fill.size * (existing.side === 'BUY' ? 1 : -1);
        this.realizedPnl += closePnl;
        recordTrade(fill.tokenId, 'polymarket', fill.side.toLowerCase() as 'buy' | 'sell', closePnl);
        dailyPnlUsd.set({ strategy: 'live' }, this.realizedPnl);
        existing.size -= fill.size;
        existing.unrealizedPnl = computeUnrealizedPnl(existing);
      }
    } else {
      // New position
      const openedAt = fill.filledAt || Date.now();
      this.positions.set(fill.tokenId, createLivePosition(fill.tokenId, fill.side, fill.size, fill.price, openedAt));
    }
  }

  /** Update mark prices and recalculate unrealized P&L for all positions */
  updatePrices(prices: Map<string, { bid: number; ask: number }>): void {
    const now = Date.now();
    for (const [tokenId, position] of this.positions) {
      const book = prices.get(tokenId);
      if (book && book.bid > 0 && book.ask > 0) {
        position.currentPrice = (book.bid + book.ask) / 2;
        position.lastPriceUpdate = now;
        position.unrealizedPnl = computeUnrealizedPnl(position);
      }
    }
  }

  getPositions(): LivePosition[] {
    return Array.from(this.positions.values());
  }

  getPosition(tokenId: string): LivePosition | undefined {
    return this.positions.get(tokenId);
  }

  getSummary(): PositionSummary {
    let totalExposure = 0;
    let totalUnrealizedPnl = 0;

    for (const pos of this.positions.values()) {
      totalExposure += pos.size * pos.currentPrice;
      totalUnrealizedPnl += pos.unrealizedPnl;
    }

    winRatePercent.set({ strategy: 'live' }, 0);
    return {
      positionCount: this.positions.size,
      totalExposure,
      totalUnrealizedPnl,
      totalRealizedPnl: this.realizedPnl,
      exposureFraction: this.capitalUsdc > 0 ? totalExposure / this.capitalUsdc : 0,
    };
  }

  getRealizedPnl(): number {
    return this.realizedPnl;
  }

  getFilledOrders(): readonly FilledOrder[] {
    return this.filledOrders;
  }

  /** Clear all state (for reset or paper mode switch) */
  reset(): void {
    this.positions.clear();
    this.realizedPnl = 0;
    this.filledOrders = [];
  }

  toJSON(): object {
    return {
      positions: Array.from(this.positions.values()),
      realizedPnl: this.realizedPnl,
      filledOrderCount: this.filledOrders.length,
    };
  }
}
