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
  return { recordFill: vi.fn(), getPositions: vi.fn().mockReturnValue([]), closePosition: vi.fn() } as unknown as LivePositionTracker;
}

function makeSignal(overrides: Partial<TradeSignal> = {}): TradeSignal {
  return {
    tokenId: '0xtoken123', side: 'BUY', price: 0.65, size: 15,
    timestamp: Date.now(), confidence: 0.85, strategy: 'test-strat',
    ...overrides,
  } as TradeSignal;
}

describe('LiveOrderManager — RiskGateManager wiring', () => {
  let adapter: PolymarketAdapter;
  let tracker: LivePositionTracker;

  beforeEach(() => {
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
    const signal = makeSignal({ size: 15 });
    const result = await mgr.submitSignal(signal, 'test-strat');
    expect(result.orderID).toBe('ord-001');
    expect(adapter.placeOrder).toHaveBeenCalled();
  });

  it('rejects order when guard blocks (daily drawdown)', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 1000, maxDailyDrawdown: 0.05, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);
    guard.recordLoss(-60);
    const signal = makeSignal({ size: 10 });
    await expect(mgr.submitSignal(signal, 'test-strat')).rejects.toThrow('RISK_GATE_REJECTED');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('rejects order when position too large', async () => {
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
    guard.recordLoss(-100);
    guard.recordLoss(-100);
    guard.recordLoss(-100);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);
    const signal = makeSignal({ size: 10 });
    await expect(mgr.submitSignal(signal, 'test-strat')).rejects.toThrow('RISK_GATE_REJECTED');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('bypasses position-size and circuit checks when guard is disabled', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 100_000, enabled: false });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);
    const signal = makeSignal({ size: 5000 });
    const result = await mgr.submitSignal(signal, 'test-strat');
    expect(result.orderID).toBe('ord-001');
  });

  it('still applies SignalTTL gate even with risk gate present', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 10_000, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);
    const staleSignal = makeSignal({ timestamp: Date.now() - 300 });
    await expect(mgr.submitSignal(staleSignal, 'test-strat')).rejects.toThrow('STALE_SIGNAL');
    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  it('still applies rate limiter even with risk gate present', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 10_000, enabled: true });
    const riskGate = new RiskGateManager(guard);
    const mgr = new LiveOrderManager(adapter, tracker, 300_000, riskGate);
    for (let i = 0; i < 10; i++) {
      await mgr.submitSignal(makeSignal(), 'rate-test');
    }
    await expect(mgr.submitSignal(makeSignal(), 'rate-test')).rejects.toThrow('RATE_LIMITED');
    expect(adapter.placeOrder).toHaveBeenCalledTimes(10);
  });
});
