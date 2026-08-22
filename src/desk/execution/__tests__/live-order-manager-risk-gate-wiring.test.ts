/**
 * Integration test for RiskGateManager wiring into LiveOrderManager.
 *
 * Verifies that the LiveExecutionGuard check (Gate 3) in submitSignal()
 * actually fires when a RiskGateManager is provided, and that backward
 * compatibility is preserved when no guard is present.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetExecutionModeCache } from '../execution-mode';
import { LiveOrderManager } from '../live-order-manager';
import { LiveExecutionGuard } from '../live-execution-guard';
import { RiskGateManager } from '../../risk/risk-gate-manager';
import type { PolymarketAdapter, PolymarketOrderResponse } from '../polymarket-adapter';
import type { LivePositionTracker } from '../live-position-tracker';
import type { TradeSignal } from '../../polymarket/strategy-live-bridge';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAdapter(): PolymarketAdapter {
  return {
    placeOrder: vi.fn().mockResolvedValue({ orderID: 'ord-001' } as PolymarketOrderResponse),
    getOrder: vi.fn().mockResolvedValue({ status: 'matched' }),
    cancelOrder: vi.fn().mockResolvedValue(undefined),
    getOpenOrders: vi.fn().mockResolvedValue([]),
    getUserBalance: vi.fn().mockResolvedValue('1000'),
  } as unknown as PolymarketAdapter;
}

function makeTracker(): LivePositionTracker {
  return {
    recordFill: vi.fn(),
    getPositions: vi.fn().mockReturnValue([]),
    closePosition: vi.fn(),
  } as unknown as LivePositionTracker;
}

function makeSignal(overrides: Partial<TradeSignal> = {}): TradeSignal {
  return {
    tokenId: '0xtoken123',
    side: 'BUY',
    price: 0.65,
    size: 15,
    timestamp: Date.now(),
    confidence: 0.85,
    strategy: 'test-strat',
    ...overrides,
  } as TradeSignal;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LiveOrderManager — RiskGateManager wiring', () => {
  let adapter: PolymarketAdapter;
  let tracker: LivePositionTracker;

  beforeEach(() => {
    // These tests exercise the live order-placement path directly, so they
    // opt into LIVE mode explicitly. Production code never sets this — it is
    // an operator env var gated by a literal-string comparison.
    process.env.LIVE_TRADING_ENABLED = 'true';
    resetExecutionModeCache();
    adapter = makeAdapter();
    tracker = makeTracker();
  });

  it('allows order when no RiskGateManager is provided (backward compat)', async () => {
    const mgr = new LiveOrderManager(adapter, tracker);
    const signal = makeSignal();
    const result = await mgr.submitSignal(signal, 'test-strat');
    expect(result.orderID).toBe('ord-001');
    expect(adapter.placeOrder).toHaveBeenCalled();
  });

  it('allows order when guard approves', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 10_000, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);

    // 15 * 0.65 = $9.75 on $10k = 0.1% (well under 2.5% limit)
    const signal = makeSignal({ size: 15 });
    const result = await mgr.submitSignal(signal, 'test-strat');
    expect(result.orderID).toBe('ord-001');
    expect(adapter.placeOrder).toHaveBeenCalled();
  });

  it('rejects order when guard blocks (daily drawdown)', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 1000, maxDailyDrawdown: 0.05, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);

    // Simulate loss exceeding 5% of $1000 = $50
    guard.recordLoss(-60);

    const signal = makeSignal({ size: 10 });
    await expect(mgr.submitSignal(signal, 'test-strat')).rejects.toThrow('RISK_GATE_REJECTED');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('rejects order when position too large', async () => {
    // 50 * 0.65 = $32.50 vs maxPositionFraction 2.5% of $1000 = $25 → rejected
    const guard = new LiveExecutionGuard({ capitalUsdc: 1000, maxPositionFraction: 0.025, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);

    const signal = makeSignal({ size: 50 });
    await expect(mgr.submitSignal(signal, 'test-strat')).rejects.toThrow('RISK_GATE_REJECTED');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('rejects order when circuit breaker is open', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 10_000, enabled: true });
    const riskGate = new RiskGateManager(guard);

    // Trip circuit breaker: 3 consecutive losses (default maxConsecutiveLosses=3)
    guard.recordLoss(-100);
    guard.recordLoss(-100);
    guard.recordLoss(-100);

    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);
    const signal = makeSignal({ size: 10 });
    await expect(mgr.submitSignal(signal, 'test-strat')).rejects.toThrow('RISK_GATE_REJECTED');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('bypasses position-size and circuit checks when guard is disabled', async () => {
    // Guard disabled → guardOrder returns approved:true immediately.
    // But RiskGateManager still runs its own drawdown/concurrent checks.
    // So set capital high enough that drawdown/concurrent checks pass.
    const guard = new LiveExecutionGuard({ capitalUsdc: 100_000, enabled: false });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);

    // Oversized order → would normally fail position check, but guard is disabled
    const signal = makeSignal({ size: 5000 }); // 5000 * 0.65 = $3250
    const result = await mgr.submitSignal(signal, 'test-strat');
    expect(result.orderID).toBe('ord-001');
  });

  it('still applies SignalTTL gate even with risk gate present', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 10_000, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);

    const staleSignal = makeSignal({ timestamp: Date.now() - 300 }); // 300ms > 200ms TTL
    await expect(mgr.submitSignal(staleSignal, 'test-strat')).rejects.toThrow('STALE_SIGNAL');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('still applies rate limiter even with risk gate present', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 10_000, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);

    // Fire 10 rapid signals (burst limit) to exhaust rate limiter
    for (let i = 0; i < 10; i++) {
      await mgr.submitSignal(makeSignal(), 'rate-test');
    }

    // 11th should be rate-limited
    await expect(mgr.submitSignal(makeSignal(), 'rate-test')).rejects.toThrow('RATE_LIMITED');
    expect(adapter.placeOrder).toHaveBeenCalledTimes(10);
  });
});
