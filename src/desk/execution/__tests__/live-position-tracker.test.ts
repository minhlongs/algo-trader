/**
 * Tests for Live Position Tracker
 * Phase 39 Polymarket Live Execution
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LivePositionTracker, type FilledOrder } from '../live-position-tracker';

function makeFill(overrides: Partial<FilledOrder> = {}): FilledOrder {
  return {
    tokenId: '0xabc123',
    side: 'BUY',
    size: 10,
    price: 0.55,
    filledAt: Date.now(),
    orderId: 'order-001',
    ...overrides,
  };
}

describe('LivePositionTracker', () => {
  let tracker: LivePositionTracker;

  beforeEach(() => {
    tracker = new LivePositionTracker(1000);
  });

  // ── New positions ─────────────────────────────────────────────────────────

  it('creates a new position on first buy fill', () => {
    tracker.recordFill(makeFill());
    const positions = tracker.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].tokenId).toBe('0xabc123');
    expect(positions[0].side).toBe('BUY');
    expect(positions[0].size).toBe(10);
    expect(positions[0].entryPrice).toBe(0.55);
  });

  it('creates a new position on first sell fill', () => {
    tracker.recordFill(makeFill({ side: 'SELL' }));
    const positions = tracker.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].side).toBe('SELL');
  });

  // ── Adding to existing position ───────────────────────────────────────────

  it('adds to existing position and recalculates VWAP entry price', () => {
    tracker.recordFill(makeFill({ size: 10, price: 0.50 }));
    tracker.recordFill(makeFill({ size: 10, price: 0.60, orderId: 'order-002' }));

    const positions = tracker.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].size).toBe(20);
    expect(positions[0].entryPrice).toBe(0.55); // (10*0.50 + 10*0.60) / 20
  });

  // ── P&L calculation ───────────────────────────────────────────────────────

  it('calculates unrealized P&L for BUY position after price update', () => {
    tracker.recordFill(makeFill({ size: 10, price: 0.50 }));
    tracker.updatePrices(new Map([['0xabc123', { bid: 0.58, ask: 0.62 }]]));

    const positions = tracker.getPositions();
    expect(positions[0].currentPrice).toBe(0.60); // midpoint
    expect(positions[0].unrealizedPnl).toBeCloseTo(1.0, 1); // (0.60 - 0.50) * 10
  });

  it('calculates unrealized P&L for SELL position after price update', () => {
    tracker.recordFill(makeFill({ side: 'SELL', size: 10, price: 0.70 }));
    tracker.updatePrices(new Map([['0xabc123', { bid: 0.58, ask: 0.62 }]]));

    const positions = tracker.getPositions();
    expect(positions[0].unrealizedPnl).toBeCloseTo(1.0, 1); // (0.70 - 0.60) * 10
  });

  it('keeps last known price when no price data available', () => {
    tracker.recordFill(makeFill({ size: 10, price: 0.50 }));
    const before = tracker.getPositions()[0].currentPrice;
    tracker.updatePrices(new Map()); // empty
    expect(tracker.getPositions()[0].currentPrice).toBe(before);
  });

  // ── Closing positions ─────────────────────────────────────────────────────

  it('fully closes position with opposite side fill and records realized P&L', () => {
    tracker.recordFill(makeFill({ side: 'BUY', size: 10, price: 0.50 }));
    tracker.recordFill(makeFill({ side: 'SELL', size: 10, price: 0.60, orderId: 'order-002' }));

    expect(tracker.getPositions()).toHaveLength(0);
    expect(tracker.getRealizedPnl()).toBeCloseTo(1.0, 1); // (0.60 - 0.50) * 10
  });

  it('partially closes position', () => {
    tracker.recordFill(makeFill({ side: 'BUY', size: 20, price: 0.50 }));
    tracker.recordFill(makeFill({ side: 'SELL', size: 5, price: 0.60, orderId: 'order-002' }));

    expect(tracker.getPositions()).toHaveLength(1);
    expect(tracker.getPositions()[0].size).toBe(15);
    // Realized P&L: 5 tokens at 0.10 profit each
    expect(tracker.getRealizedPnl()).toBeCloseTo(0.5, 5);
  });

  it('flips position when opposite side is larger than existing', () => {
    tracker.recordFill(makeFill({ side: 'BUY', size: 10, price: 0.50 }));
    tracker.recordFill(makeFill({ side: 'SELL', size: 15, price: 0.60, orderId: 'order-002' }));

    const positions = tracker.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].side).toBe('SELL');
    expect(positions[0].size).toBe(5); // 15 - 10 = 5 flipped
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  it('getSummary returns correct aggregate metrics', () => {
    tracker.recordFill(makeFill({ size: 10, price: 0.50 }));
    tracker.recordFill(makeFill({ tokenId: '0xdef456', size: 5, price: 0.80, orderId: 'order-002' }));
    tracker.updatePrices(new Map([
      ['0xabc123', { bid: 0.58, ask: 0.62 }],
      ['0xdef456', { bid: 0.78, ask: 0.82 }],
    ]));

    const summary = tracker.getSummary();
    expect(summary.positionCount).toBe(2);
    expect(summary.totalExposure).toBeCloseTo(10 * 0.60 + 5 * 0.80, 0);
    expect(summary.exposureFraction).toBeCloseTo((10 * 0.60 + 5 * 0.80) / 1000, 2);
  });

  it('returns zeros for empty tracker', () => {
    const summary = tracker.getSummary();
    expect(summary.positionCount).toBe(0);
    expect(summary.totalExposure).toBe(0);
    expect(summary.totalUnrealizedPnl).toBe(0);
    expect(summary.totalRealizedPnl).toBe(0);
  });

  // ── Reset ─────────────────────────────────────────────────────────────────

  it('reset clears all state', () => {
    tracker.recordFill(makeFill());
    tracker.reset();
    expect(tracker.getPositions()).toHaveLength(0);
    expect(tracker.getRealizedPnl()).toBe(0);
    expect(tracker.getSummary().positionCount).toBe(0);
  });
});
