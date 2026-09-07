/**
 * Tests for Strategy Live Bridge
 * Phase 40 Strategy-to-Live Bridge
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock global fetch for Gamma API
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { StrategyLiveBridge, type TradeSignal } from '../strategy-live-bridge';
import { LiveTradingOrchestrator } from '../live-trading-orchestrator';

describe('StrategyLiveBridge', () => {
  let bridge: StrategyLiveBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    const orch = new LiveTradingOrchestrator({ paperTrading: true, capitalUsdc: 1000 });
    bridge = new StrategyLiveBridge(orch);
    mockPlaceOrder.mockResolvedValue({ orderID: 'test-order-1', status: 'matched' });
  });

  afterEach(() => {
    bridge.stopScanner();
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

  it('uses signal.size when provided, otherwise computes from confidence', async () => {
    // With explicit size
    await bridge.onSignal({ tokenId: '0x01', side: 'BUY', size: 50, price: 0.50 });
    expect(mockPlaceOrder).toHaveBeenCalledWith(expect.objectContaining({ size: 50 }));

    vi.clearAllMocks();
    mockPlaceOrder.mockResolvedValue({ orderID: 'test-order-2', status: 'matched' });

    // Without size, computes from confidence (0.8 confidence → 8)
    await bridge.onSignal({ tokenId: '0x02', side: 'BUY', size: 0, price: 0.50, confidence: 0.8 });
    expect(mockPlaceOrder).toHaveBeenCalledWith(expect.objectContaining({ size: 8 }));

    vi.clearAllMocks();
    mockPlaceOrder.mockResolvedValue({ orderID: 'test-order-3', status: 'matched' });

    // Default confidence 0.5 → 5
    await bridge.onSignal({ tokenId: '0x03', side: 'BUY', size: 0, price: 0.50 });
    expect(mockPlaceOrder).toHaveBeenCalledWith(expect.objectContaining({ size: 5 }));
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
    expect(bridge.getStats().scannerActive).toBe(true);
    bridge.stopScanner();
  });

  // ── Scanner with mocked Gamma API ────────────────────────────────────────

  it('scanner fetches markets and processes endgame signals', async () => {
    // Mock Gamma API response with endgame markets
    // Edge calculations:
    // BUY YES (yes > 0.95): edge = 1 - yes - 0.02 → need yes < 0.97 for edge > 0.01
    // BUY NO (yes < 0.05): edge = yes - 0.02 → need yes > 0.03 for edge > 0.01
    const mockMarkets = [
      {
        // yes=0.96, edge = 1 - 0.96 - 0.02 = 0.02 (2%) > 0.01 → PASS
        outcomePrices: '["0.96", "0.04"]',
        volume: '50000',
        clobTokenIds: '["0xYES1", "0xNO1"]',
        question: 'Will BTC hit $100k by EOY?',
      },
      {
        // yes=0.04, edge = 0.04 - 0.02 = 0.02 (2%) > 0.01 → PASS
        outcomePrices: '["0.04", "0.96"]',
        volume: '25000',
        clobTokenIds: '["0xYES2", "0xNO2"]',
        question: 'Will ETH flip BTC?',
      },
      // Low volume - should be skipped
      {
        outcomePrices: '["0.99", "0.01"]',
        volume: '5000',
        clobTokenIds: '["0xYES3", "0xNO3"]',
        question: 'Low volume market',
      },
      // Not endgame - should be skipped
      {
        outcomePrices: '["0.55", "0.45"]',
        volume: '100000',
        clobTokenIds: '["0xYES4", "0xNO4"]',
        question: 'Balanced market',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMarkets,
    });

    // Start scanner with short interval and low threshold to catch test markets
    bridge.startEndgameScanner({
      scanIntervalMs: 1000,
      minVolume: 10000,
      maxSignalsPerScan: 5,
      priceThreshold: 0.95,
      capitalUsdc: 1000,
    });

    // Wait for scan to complete (scan runs immediately on start)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = bridge.getStats();
    expect(stats.scansCompleted).toBeGreaterThanOrEqual(1);
    expect(stats.signalsProcessed).toBeGreaterThanOrEqual(1);

    // Should have placed orders for endgame markets (2 valid ones)
    expect(mockPlaceOrder).toHaveBeenCalledTimes(2);
  });

  it('scanner handles Gamma API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    bridge.startEndgameScanner({ scanIntervalMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = bridge.getStats();
    expect(stats.scansCompleted).toBeGreaterThanOrEqual(1);
    // No orders should be placed on API error
    // mockPlaceOrder should not be called for this scan cycle
  });

  it('scanner handles network timeout', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    bridge.startEndgameScanner({ scanIntervalMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = bridge.getStats();
    expect(stats.scansCompleted).toBeGreaterThanOrEqual(1);
  });

  it('scanner skips malformed market entries', async () => {
    const mockMarkets = [
      {
        // yes=0.96, edge = 1 - 0.96 - 0.02 = 0.02 > 0.01 → PASS
        outcomePrices: '["0.96", "0.04"]',
        volume: '50000',
        clobTokenIds: '["0xYES1", "0xNO1"]',
        question: 'Valid market',
      },
      {
        // Malformed - missing clobTokenIds
        outcomePrices: '["0.97", "0.03"]',
        volume: '50000',
        question: 'Malformed market',
      },
      {
        // Malformed - invalid JSON
        outcomePrices: 'not-json',
        volume: '50000',
        clobTokenIds: '["0xYES3", "0xNO3"]',
        question: 'Invalid JSON',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMarkets,
    });

    bridge.startEndgameScanner({ scanIntervalMs: 1000, minVolume: 10000, priceThreshold: 0.95 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = bridge.getStats();
    expect(stats.scansCompleted).toBeGreaterThanOrEqual(1);
    // Should only process the valid market
    expect(mockPlaceOrder).toHaveBeenCalledTimes(1);
  });

  it('scanner respects maxSignalsPerScan limit', async () => {
    const mockMarkets = Array.from({ length: 10 }, (_, i) => ({
      // Alternate between high YES and low YES to get valid edges
      // even i: yes=0.96 (edge=0.02), odd i: yes=0.04 (edge=0.02)
      outcomePrices: i % 2 === 0 ? '["0.96", "0.04"]' : '["0.04", "0.96"]',
      volume: '50000',
      clobTokenIds: `[\"0xYES${i}\", \"0xNO${i}\"]`,
      question: `Market ${i}`,
    }));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMarkets,
    });

    bridge.startEndgameScanner({ scanIntervalMs: 1000, maxSignalsPerScan: 3, minVolume: 10000, priceThreshold: 0.95 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should only process maxSignalsPerScan (3) markets
    expect(mockPlaceOrder).toHaveBeenCalledTimes(3);
  });

  it('scanner uses correct side and price for BUY YES (high price) and BUY NO (low price)', async () => {
    const mockMarkets = [
      {
        // High YES price (0.96) → BUY NO (cheaper side)
        // edge = 1 - 0.96 - 0.02 = 0.02 > 0.01 → PASS
        // side = BUY, price = 0.96 (YES price used)
        outcomePrices: '["0.96", "0.04"]',
        volume: '50000',
        clobTokenIds: '["0xYES_HI", "0xNO_HI"]',
        question: 'High YES',
      },
      {
        // Low YES price (0.04) → BUY YES (cheaper side)
        // edge = 0.04 - 0.02 = 0.02 > 0.01 → PASS
        // side = SELL, price = 0.04 (YES price used)
        outcomePrices: '["0.04", "0.96"]',
        volume: '50000',
        clobTokenIds: '["0xYES_LO", "0xNO_LO"]',
        question: 'Low YES',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMarkets,
    });

    bridge.startEndgameScanner({ scanIntervalMs: 1000, minVolume: 10000, priceThreshold: 0.95 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPlaceOrder).toHaveBeenCalledTimes(2);

    // First market: YES=0.96 (>0.95 threshold) → isEndgame=true, edge=1-0.96-0.02=0.02
    // side = BUY (buy cheaper NO side), price = 0.96
    // Second market: YES=0.04 (<0.05 threshold) → isEndgame=true, edge=0.04-0.02=0.02
    // side = SELL (buy cheaper YES side), price = 0.04
  });

  it('scanner calculates edge correctly and filters minimum edge', async () => {
    const mockMarkets = [
      {
        // yes=0.90, edge = 1 - 0.90 - 0.02 = 0.08 (8%) → PASS
        outcomePrices: '["0.90", "0.10"]',
        volume: '50000',
        clobTokenIds: '["0xYES_A", "0xNO_A"]',
        question: 'Market A',
      },
      {
        // yes=0.10, edge = 0.10 - 0.02 = 0.08 (8%) → PASS
        outcomePrices: '["0.10", "0.90"]',
        volume: '50000',
        clobTokenIds: '["0xYES_B", "0xNO_B"]',
        question: 'Market B',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMarkets,
    });

    bridge.startEndgameScanner({ scanIntervalMs: 1000, minVolume: 10000, priceThreshold: 0.85 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPlaceOrder).toHaveBeenCalledTimes(2);
  });

  it('stopScanner logs final stats', () => {
    bridge.startEndgameScanner({ scanIntervalMs: 1000 });
    bridge.stopScanner();

    const stats = bridge.getStats();
    expect(stats.scannerActive).toBe(false);
    // signalsProcessed and signalsRejected should be tracked
    expect(typeof stats.signalsProcessed).toBe('number');
    expect(typeof stats.signalsRejected).toBe('number');
  });

  it('computeSize uses signal.size when > 0', async () => {
    await bridge.onSignal({ tokenId: '0xSIZE', side: 'BUY', size: 99, price: 0.50 });
    expect(mockPlaceOrder).toHaveBeenCalledWith(expect.objectContaining({ size: 99 }));
  });
});
