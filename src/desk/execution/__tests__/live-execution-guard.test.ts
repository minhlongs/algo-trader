/**
 * Tests for Live Execution Guard
 * Phase 39 Polymarket Live Execution
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LiveExecutionGuard, type GuardConfig } from '../live-execution-guard';
import { LivePositionTracker } from '../live-position-tracker';
import type { PolymarketOrder } from '../polymarket-signer';

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    tokenId: '0xabc123', price: 0.55, size: 10, side: 'BUY',
    expiration: Math.floor(Date.now() / 1000) + 3600, nonce: '1', feeRateBps: 0, signatureType: 0, ...overrides,
  };
}

describe('LiveExecutionGuard', () => {
  let guard: LiveExecutionGuard;
  const baseConfig = { capitalUsdc: 1000 };

  beforeEach(() => { guard = new LiveExecutionGuard(baseConfig); });

  it('approves all orders when guard is disabled (default)', () => {
    const order = makeOrder({ size: 1000, price: 1.0 }); // huge order
    const result = guard.guardOrder(order);
    expect(result.approved).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects order exceeding max position fraction', () => {
    guard.setEnabled(true);
    const smallOrder = makeOrder({ size: 10, price: 0.55 });
    expect(guard.guardOrder(smallOrder).approved).toBe(true);

    const bigOrder = makeOrder({ size: 100, price: 0.55 });
    const result = guard.guardOrder(bigOrder);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('exceeds max position');
    expect(result.checks.positionSizeOk).toBe(false);
  });

  it('position size check respects custom maxPositionFraction', () => {
    const custom = new LiveExecutionGuard({ capitalUsdc: 1000, maxPositionFraction: 0.10 });
    custom.setEnabled(true);
    expect(custom.guardOrder(makeOrder({ size: 100, price: 0.55 })).approved).toBe(true);
  });

  it('rejects orders when daily drawdown exceeds limit', () => {
    guard.setEnabled(true);
    guard.recordLoss(-60);
    const result = guard.guardOrder(makeOrder());
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('drawdown');
    expect(result.checks.dailyDrawdownOk).toBe(false);
  });

  it('does not trip on small drawdown', () => {
    guard.setEnabled(true);
    guard.recordLoss(-30);
    expect(guard.guardOrder(makeOrder()).approved).toBe(true);
  });

  it('rejects orders when at max concurrent positions', () => {
    const tracker = new LivePositionTracker(1000);
    for (let i = 0; i < 10; i++) {
      tracker.recordFill({
        tokenId: `0x${i.toString(16).padStart(8, '0')}`, side: 'BUY', size: 1,
        price: 0.5, filledAt: Date.now(), orderId: `order-${i}`,
      });
    }
    guard.setEnabled(true);
    guard.attachTracker(tracker);
    const result = guard.guardOrder(makeOrder());
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('Open positions');
    expect(result.checks.concurrentLimitOk).toBe(false);
  });

  // ── Circuit breaker ─────────────────────────────────────────────────────

  it('trips circuit breaker after maxConsecutiveLosses', () => {
    guard.setEnabled(true);
    [-10, -15, -5].forEach((pnl) => guard.recordLoss(pnl)); // 3 consecutive losses → trip
    const result = guard.guardOrder(makeOrder());
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('Circuit breaker tripped');
    expect(result.checks.circuitBreakerOk).toBe(false);
  });

  it('resets consecutive losses on a win', () => {
    guard.setEnabled(true);
    guard.recordLoss(-10);
    guard.recordLoss(-15);
    guard.recordWin(30); // win resets the streak
    guard.recordLoss(-5);
    guard.recordLoss(-5);
    expect(guard.guardOrder(makeOrder()).approved).toBe(true);
  });

  it('resetCircuit clears the trip and loss count', () => {
    guard.setEnabled(true);
    [-10, -15, -5].forEach((pnl) => guard.recordLoss(pnl)); // tripped
    expect(guard.guardOrder(makeOrder()).approved).toBe(false);
    guard.resetCircuit();
    expect(guard.guardOrder(makeOrder()).approved).toBe(true);
    expect(guard.getStatus().circuitTripped).toBe(false);
  });

  // ── Status ──────────────────────────────────────────────────────────────

  it('getStatus returns accurate guard state', () => {
    guard.setEnabled(true);
    guard.recordWin(100);
    guard.recordLoss(-30);
    guard.recordWin(50);
    const status = guard.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.totalWins).toBe(2);
    expect(status.totalLosses).toBe(1);
    expect(status.consecutiveLosses).toBe(0);
    expect(status.circuitTripped).toBe(false);
    expect(status.dailyPnl).toBe(120); // 100 - 30 + 50
  });

  it('setEnabled toggles guard on and off', () => {
    guard.setEnabled(false);
    expect(guard.getStatus().enabled).toBe(false);
    guard.setEnabled(true);
    expect(guard.getStatus().enabled).toBe(true);
  });

  // ── Custom config ──────────────────────────────────────────────────────

  it('respects custom maxConsecutiveLosses', () => {
    const custom = new LiveExecutionGuard({ capitalUsdc: 1000, maxConsecutiveLosses: 5 });
    custom.setEnabled(true);
    [-10, -10, -10, -10].forEach((pnl) => custom.recordLoss(pnl)); // 4 losses — still under 5
    expect(custom.guardOrder(makeOrder()).approved).toBe(true);
    custom.recordLoss(-10); // 5th loss
    expect(custom.guardOrder(makeOrder()).approved).toBe(false);
  });
});
