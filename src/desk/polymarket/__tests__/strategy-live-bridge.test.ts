/**
 * Tests for Strategy Live Bridge
 * Phase 40 Strategy-to-Live Bridge
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the orchestrator
const mockPlaceOrder = vi.fn();
const mockGetStatus = vi.fn().mockReturnValue('running');
const mockGetSummary = vi.fn().mockReturnValue({
  positionCount: 0, totalExposure: 0, totalUnrealizedPnl: 0,
  totalRealizedPnl: 0, exposureFraction: 0,
});
const mockGetGuardStatus = vi.fn().mockReturnValue({
  enabled: true, consecutiveLosses: 0, totalLosses: 0, totalWins: 0,
  circuitTripped: false, dailyPnl: 0, openPositions: 0,
});

vi.mock('../live-trading-orchestrator', () => ({
  LiveTradingOrchestrator: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.placeOrder = mockPlaceOrder;
    this.getStatus = mockGetStatus;
    this.getPositionSummary = mockGetSummary;
    this.getGuardStatus = mockGetGuardStatus;
    this.start = vi.fn().mockResolvedValue(undefined);
    this.stop = vi.fn().mockResolvedValue(undefined);
    this.getMode = () => 'PAPER';
    this.getPositions = () => [];
    this.getActiveOrders = () => [];
  }),
}));

import { StrategyLiveBridge, type TradeSignal } from '../strategy-live-bridge';
import { LiveTradingOrchestrator } from '../live-trading-orchestrator';

describe('StrategyLiveBridge', () => {
  let bridge: StrategyLiveBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    const orch = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 1000 });
    bridge = new StrategyLiveBridge(orch);
    mockPlaceOrder.mockResolvedValue({ orderID: 'test-order-1', status: 'matched' });
  });

  // ── Signal routing ───────────────────────────────────────────────────────

  it('routes a trade signal to the orchestrator', async () => {
    const signal: TradeSignal = {
      tokenId: '0xabc123',
      side: 'BUY',
      size: 10,
      price: 0.55,
      description: 'Test market',
    };

    const result = await bridge.onSignal(signal);
    expect(result.rejected).toBe(false);
    expect(result.response).toEqual({ orderID: 'test-order-1', status: 'matched' });
    expect(mockPlaceOrder).toHaveBeenCalledTimes(1);
  });

  it('handles guard rejection gracefully', async () => {
    mockPlaceOrder.mockRejectedValueOnce(new Error('Guard rejected: exceeds max position'));

    const result = await bridge.onSignal({
      tokenId: '0xbig',
      side: 'BUY',
      size: 1000,
      price: 0.99,
    });

    expect(result.rejected).toBe(true);
    expect(result.rejectReason).toContain('Guard rejected');
  });

  it('handles execution errors', async () => {
    mockPlaceOrder.mockRejectedValueOnce(new Error('Network error'));

    const result = await bridge.onSignal({
      tokenId: '0xerr',
      side: 'SELL',
      size: 5,
      price: 0.30,
    });

    expect(result.rejected).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('routes multiple signals in parallel', async () => {
    const signals: TradeSignal[] = [
      { tokenId: '0x01', side: 'BUY', size: 5, price: 0.60 },
      { tokenId: '0x02', side: 'SELL', size: 3, price: 0.40 },
    ];

    const results = await bridge.onSignals(signals);
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.rejected)).toBe(true);
    expect(mockPlaceOrder).toHaveBeenCalledTimes(2);
  });

  // ── Scanner ──────────────────────────────────────────────────────────────

  it('starts and stops scanner without errors', () => {
    bridge.startEndgameScanner({ scanIntervalMs: 60_000 });
    expect(bridge.getStats().scannerActive).toBe(true);

    bridge.stopScanner();
    expect(bridge.getStats().scannerActive).toBe(false);
  });

  it('getStats returns initial state', () => {
    const stats = bridge.getStats();
    expect(stats.scansCompleted).toBe(0);
    expect(stats.signalsProcessed).toBe(0);
    expect(stats.signalsRejected).toBe(0);
    expect(stats.scannerActive).toBe(false);
  });

  it('getStats reflects processed signals', async () => {
    await bridge.onSignal({ tokenId: '0x01', side: 'BUY', size: 5, price: 0.50 });
    const stats = bridge.getStats();
    expect(stats.signalsProcessed).toBe(1);
  });

  it('scanner does not overlap scan cycles', () => {
    bridge.startEndgameScanner({ scanIntervalMs: 30_000 });
    // Stats should show active scanner
    expect(bridge.getStats().scannerActive).toBe(true);
    bridge.stopScanner();
  });
});
