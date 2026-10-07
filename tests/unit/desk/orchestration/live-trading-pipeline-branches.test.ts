import { describe, it, expect, vi } from 'vitest';
import { LiveTradingPipelineOrchestrator } from '../../../../src/desk/orchestration/live-trading-pipeline-orchestrator';
import type { CrossVenueArbOpportunity, VenueQuote } from '../../../../src/desk/arbitrage/connectors/cross-venue-arb-detector';
import type { CanaryTelemetrySample } from '../../../../src/desk/execution/edge-canary-deployment-verifier';

describe('LiveTradingPipelineOrchestrator branch coverage', () => {
  const dummyPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const mockWsFactory = () => ({
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  });

  const quoteA: VenueQuote = {
    venue: 'binance',
    symbol: 'BTCUSDT',
    bid: 50000,
    ask: 50010,
    bidSize: 1,
    askSize: 1,
    timestamp: Date.now(),
  };

  const quoteB: VenueQuote = {
    venue: 'polymarket',
    symbol: '0xpoly',
    bid: 50100,
    ask: 50120,
    bidSize: 1,
    askSize: 1,
    timestamp: Date.now(),
  };

  it('returns empty array when evaluateAndExecuteArb is called while not running', async () => {
    const orchestrator = new LiveTradingPipelineOrchestrator({ wsFactory: mockWsFactory });
    const opps = await orchestrator.evaluateAndExecuteArb(quoteA, quoteB);
    expect(opps).toEqual([]);
  });

  it('handles auto-execution of viable arb opportunities with polymarket relayer', async () => {
    const orchestrator = new LiveTradingPipelineOrchestrator({
      wsFactory: mockWsFactory,
      relayerPrivateKey: dummyPrivateKey,
      autoExecuteArb: true,
    });
    await orchestrator.start();

    // Mock viable opp
    const viableOpp: CrossVenueArbOpportunity = {
      buyVenue: 'polymarket',
      sellVenue: 'binance',
      symbol: '0xpoly',
      buyPrice: 0.45,
      sellPrice: 0.55,
      grossSpreadBps: 2000,
      netSpreadBps: 1800,
      maxVolume: 100,
      estimatedProfitUsd: 10,
      isViable: true,
      timestamp: Date.now(),
    };

    vi.spyOn(orchestrator.arbDetector, 'evaluatePair').mockReturnValue([viableOpp]);
    if (orchestrator.relayer) {
      vi.spyOn(orchestrator.relayer, 'buildAndSignOrder').mockResolvedValue({} as any);
      vi.spyOn(orchestrator.relayer, 'submitRelayerOrder').mockResolvedValue({
        orderId: 'rel-1',
        status: 'SUBMITTED',
        timestamp: Date.now(),
      });
    }

    const opps = await orchestrator.evaluateAndExecuteArb(quoteA, quoteB);
    expect(opps).toHaveLength(1);
    expect(orchestrator.getMetrics().ordersRelayed).toBe(1);
    expect(orchestrator.getMetrics().successfulOrders).toBe(1);

    orchestrator.stop();
  });

  it('handles relayer failure status and errors during auto execution', async () => {
    const orchestrator = new LiveTradingPipelineOrchestrator({
      wsFactory: mockWsFactory,
      relayerPrivateKey: dummyPrivateKey,
      autoExecuteArb: true,
    });
    await orchestrator.start();

    const viableOppSell: CrossVenueArbOpportunity = {
      buyVenue: 'binance',
      sellVenue: 'polymarket',
      symbol: '0xpoly',
      buyPrice: 0.45,
      sellPrice: 0.55,
      grossSpreadBps: 2000,
      netSpreadBps: 1800,
      maxVolume: 100,
      estimatedProfitUsd: 10,
      isViable: true,
      timestamp: Date.now(),
    };

    vi.spyOn(orchestrator.arbDetector, 'evaluatePair').mockReturnValue([viableOppSell]);
    if (orchestrator.relayer) {
      vi.spyOn(orchestrator.relayer, 'buildAndSignOrder').mockResolvedValue({} as any);
      vi.spyOn(orchestrator.relayer, 'submitRelayerOrder').mockResolvedValue({
        orderId: 'rel-2',
        status: 'FAILED',
        error: 'Insufficient balance',
        timestamp: Date.now(),
      });
    }

    // Attach error listener so EventEmitter does not throw unhandled error event
    orchestrator.on('error', () => {});

    await orchestrator.evaluateAndExecuteArb(quoteA, quoteB);
    expect(orchestrator.getMetrics().failedOrders).toBe(1);

    // Relayer throws error
    if (orchestrator.relayer) {
      vi.spyOn(orchestrator.relayer, 'submitRelayerOrder').mockRejectedValue(new Error('Network error'));
    }
    await orchestrator.evaluateAndExecuteArb(quoteA, quoteB);
    expect(orchestrator.getMetrics().failedOrders).toBe(2);

    orchestrator.stop();
  });

  it('records telemetry and verifies canary stage progression', async () => {
    const orchestrator = new LiveTradingPipelineOrchestrator({ wsFactory: mockWsFactory });

    const sample: CanaryTelemetrySample = {
      stage: 0,
      timestamp: Date.now(),
      errorRate: 0.001,
      p99LatencyMs: 45,
      fillRate: 0.99,
      drawdownPct: 0.01,
      totalTrades: 100,
    };
    orchestrator.recordTelemetry(sample, false);
    orchestrator.recordTelemetry(sample, true);

    vi.spyOn(orchestrator.canaryVerifier, 'verifyStage').mockResolvedValue({
      stage: 0,
      passed: true,
      reason: 'All checks green',
      nextRecommendedStage: 1,
      checks: [],
    });

    const verdict = await orchestrator.verifyCanaryStage(0);
    expect(verdict.passed).toBe(true);
    expect(orchestrator.getMetrics().activeCanaryStage).toBe(1);
  });
});
