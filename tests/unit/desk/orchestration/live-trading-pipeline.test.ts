/**
 * Live Trading Pipeline Orchestration & Multi-Region Suite Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LiveTradingPipelineOrchestrator } from '../../../../src/desk/orchestration/live-trading-pipeline-orchestrator';
import type { VenueQuote } from '../../../../src/desk/arbitrage/connectors/cross-venue-arb-detector';
import type { Chromosome, FitnessEvaluator } from '../../../../src/alpha-lab/alpha-discovery/genetic-evolution-types';
import {
  verifyRegionHealth,
  verifyDoConsensus,
  verifyShardRouting,
  runMultiRegionVerification,
  EDGE_REGIONS,
} from '../../../../scripts/verify-edge-multi-region-live';

describe('LiveTradingPipelineOrchestrator', () => {
  const dummyPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const mockWsFactory = () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: (evt: string, fn: (...args: unknown[]) => void) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      },
    };
  };

  it('initializes in idle status with default metrics', () => {
    const orchestrator = new LiveTradingPipelineOrchestrator({
      wsFactory: mockWsFactory,
    });
    const metrics = orchestrator.getMetrics();
    expect(metrics.status).toBe('idle');
    expect(metrics.opportunitiesDetected).toBe(0);
    expect(metrics.evolutionCycles).toBe(0);
    expect(metrics.activeCanaryStage).toBe(0);
  });

  it('controls lifecycle: start -> pause -> resume -> stop', async () => {
    const orchestrator = new LiveTradingPipelineOrchestrator({
      wsFactory: mockWsFactory,
      trackedVenues: ['binance'],
      trackedSymbols: ['BTCUSDT'],
    });

    await orchestrator.start();
    expect(orchestrator.getMetrics().status).toBe('running');

    orchestrator.pause();
    expect(orchestrator.getMetrics().status).toBe('paused');

    orchestrator.resume();
    expect(orchestrator.getMetrics().status).toBe('running');

    orchestrator.stop();
    expect(orchestrator.getMetrics().status).toBe('stopped');
  });

  it('evaluates cross-venue arbitrage opportunities and triggers hooks', async () => {
    const onOpp = vi.fn();
    const orchestrator = new LiveTradingPipelineOrchestrator(
      {
        wsFactory: mockWsFactory,
        relayerPrivateKey: dummyPrivateKey,
        autoExecuteArb: false,
      },
      { onOpportunity: onOpp }
    );
    await orchestrator.start();

    const quoteA: VenueQuote = {
      venue: 'binance',
      symbol: 'BTC',
      bestBid: 50000,
      bestBidQty: 1.0,
      bestAsk: 50010,
      bestAskQty: 1.0,
    };
    const quoteB: VenueQuote = {
      venue: 'polymarket',
      symbol: 'BTC',
      bestBid: 50500,
      bestBidQty: 1.0,
      bestAsk: 50520,
      bestAskQty: 1.0,
    };

    const opps = await orchestrator.evaluateAndExecuteArb(quoteA, quoteB);
    expect(opps.length).toBeGreaterThan(0);
    expect(onOpp).toHaveBeenCalled();
    expect(orchestrator.getMetrics().opportunitiesDetected).toBeGreaterThan(0);
  });

  it('runs genetic evolution cycles and updates metrics', async () => {
    const onEvol = vi.fn();
    const orchestrator = new LiveTradingPipelineOrchestrator(
      { wsFactory: mockWsFactory },
      { onEvolutionCycle: onEvol }
    );

    const evaluator: FitnessEvaluator = (ind: Chromosome) => ({
      sharpeRatio: 1.5,
      sortinoRatio: 1.8,
      deflatedSharpeRatio: 0.95,
      complexityPenalty: 2.0,
    });

    const summary = await orchestrator.runEvolutionCycle(evaluator, 'arb_family');
    expect(summary.generationHistory.length).toBe(6); // gen 0 + 5 generations
    expect(summary.bestChromosome).toBeDefined();
    expect(onEvol).toHaveBeenCalledWith(summary);
    expect(orchestrator.getMetrics().evolutionCycles).toBe(1);
  });

  it('records telemetry and executes canary stage verification', async () => {
    const onVerdict = vi.fn();
    const orchestrator = new LiveTradingPipelineOrchestrator(
      { wsFactory: mockWsFactory },
      { onCanaryVerdict: onVerdict }
    );

    for (let i = 0; i < 40; i++) {
      orchestrator.recordTelemetry({ latencyMs: 5 + Math.random(), slippageBps: 0.5, isError: false, timestamp: Date.now() }, true);
      orchestrator.recordTelemetry({ latencyMs: 5 + Math.random(), slippageBps: 0.5, isError: false, timestamp: Date.now() }, false);
    }

    const verdict = await orchestrator.verifyCanaryStage(0);
    expect(verdict.passed).toBe(true);
    expect(verdict.nextRecommendedStage).toBe(1);
    expect(onVerdict).toHaveBeenCalledWith(verdict);
    expect(orchestrator.getMetrics().activeCanaryStage).toBe(1);
  });
});

describe('Edge Multi-Region Verification Suite', () => {
  const mockSuccessFetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/api/consensus/status')) {
      return new Response(JSON.stringify({ leader: true, term: 5, quorum: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  });

  it('verifies region health', async () => {
    const res = await verifyRegionHealth(EDGE_REGIONS.tokyo, mockSuccessFetch);
    expect(res.healthy).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.region).toBe('tokyo');
  });

  it('verifies Durable Object consensus status', async () => {
    const res = await verifyDoConsensus(EDGE_REGIONS.singapore, mockSuccessFetch);
    expect(res.leaderReachable).toBe(true);
    expect(res.quorumSatisfied).toBe(true);
    expect(res.term).toBe(5);
  });

  it('verifies shard ring routing accuracy across 12 shards', async () => {
    const res = await verifyShardRouting(EDGE_REGIONS.frankfurt, 12, mockSuccessFetch);
    expect(res.routingAccurate).toBe(true);
    expect(res.healthyShards).toBe(12);
    expect(res.sampleStrategyRoutes.length).toBe(4);
  });

  it('executes full multi-region verification across Tokyo, Singapore, Frankfurt', async () => {
    const summary = await runMultiRegionVerification(mockSuccessFetch);
    expect(summary.allHealthy).toBe(true);
    expect(summary.regions.tokyo.health.healthy).toBe(true);
    expect(summary.regions.singapore.consensus.quorumSatisfied).toBe(true);
    expect(summary.regions.frankfurt.shardRouting.routingAccurate).toBe(true);
  });
});
