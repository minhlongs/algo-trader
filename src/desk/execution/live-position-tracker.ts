/**
 * Live Position Tracker
 *
 * Tracks Polymarket positions (ERC-1155 token balances) with unrealized/realized P&L.
 * Uses midpoint pricing from orderbook snapshots for mark-to-market valuation.
 *
 * Polymarket positions are token-ID-based (not symbol/exchange like the Redis
 * PositionManager). Each position represents an outcome token balance from a
 * filled CLOB order.
 */

import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Tracker ────────────────────────────────────────────────────────────────────

export class LivePositionTracker {
  private positions = new Map<string, LivePosition>();
  private realizedPnl = 0;
  private filledOrders: FilledOrder[] = [];
  private readonly capitalUsdc: number;

  constructor(capitalUsdc: number = 1000) {
    this.capitalUsdc = capitalUsdc;
  }

  // ── Position lifecycle ────────────────────────────────────────────────────

  /** Record a filled order — opens or adds to a position */
  recordFill(fill: FilledOrder): void {
    this.filledOrders.push(fill);

    const existing = this.positions.get(fill.tokenId);

    if (existing && existing.side === fill.side) {
      // Add to existing position — recalculate VWAP entry
      const totalSize = existing.size + fill.size;
      existing.entryPrice =
        (existing.entryPrice * existing.size + fill.price * fill.size) / totalSize;
      existing.size = totalSize;
      existing.unrealizedPnl = this.computeUnrealizedPnl(existing);
      logger.debug('Position increased', 'LivePositionTracker', {
        tokenId: fill.tokenId.slice(0, 12),
        newSize: totalSize,
        avgEntry: existing.entryPrice.toFixed(4),
      });
    } else if (existing && existing.side !== fill.side) {
      // Opposite side — reduce or flip position
      if (fill.size >= existing.size) {
        // Full close + potential flip
        const closePnl = this.computeClosePnl(existing, fill.price);
        this.realizedPnl += closePnl;
        const remaining = fill.size - existing.size;
        if (remaining > 0) {
          // Flipped — create new position on opposite side
          this.positions.set(fill.tokenId, {
            tokenId: fill.tokenId,
            side: fill.side,
            size: remaining,
            entryPrice: fill.price,
            currentPrice: fill.price,
            unrealizedPnl: 0,
            openedAt: Date.now(),
            lastPriceUpdate: Date.now(),
          });
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
        const closePnl =
          (fill.price - existing.entryPrice) * fill.size *
          (existing.side === 'BUY' ? 1 : -1);
        this.realizedPnl += closePnl;
        existing.size -= fill.size;
        existing.unrealizedPnl = this.computeUnrealizedPnl(existing);
      }
    } else {
      // New position
      this.positions.set(fill.tokenId, {
        tokenId: fill.tokenId,
        side: fill.side,
        size: fill.size,
        entryPrice: fill.price,
        currentPrice: fill.price,
        unrealizedPnl: 0,
        openedAt: fill.filledAt || Date.now(),
        lastPriceUpdate: Date.now(),
      });
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
        position.unrealizedPnl = this.computeUnrealizedPnl(position);
      }
      // If no price data, keep last known price
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

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

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): object {
    return {
      positions: Array.from(this.positions.values()),
      realizedPnl: this.realizedPnl,
      filledOrderCount: this.filledOrders.length,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private computeUnrealizedPnl(pos: LivePosition): number {
    if (pos.side === 'BUY') {
      return (pos.currentPrice - pos.entryPrice) * pos.size;
    }
    return (pos.entryPrice - pos.currentPrice) * pos.size;
  }

  private computeClosePnl(pos: LivePosition, exitPrice: number): number {
    if (pos.side === 'BUY') {
      return (exitPrice - pos.entryPrice) * pos.size;
    }
    return (pos.entryPrice - exitPrice) * pos.size;
  }
}
