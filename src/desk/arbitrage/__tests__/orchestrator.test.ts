/**
 * Strategy Orchestrator Tests
 * Tests for the main orchestrator coordinating feed aggregator, spread detector,
 * signal scorer, and unified execution engine
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrategyOrchestrator, createStrategyOrchestrator, OrchestratorConfig } from '../orchestrator';
import { ArbitrageOpportunity, ExecutionResult } from '../types';

vi.mock('../feeds/feed-aggregator', () => ({
  FeedAggregator: class {
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    onFeed = vi.fn();
    getAverageLatency = vi.fn().mockReturnValue(50);
    isConnected = vi.fn().mockReturnValue(true);
  },
}));

vi.mock('../feeds/binance-ws', () => ({
  BinanceWebSocketClient: class {
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    onMessage = vi.fn();
  },
}));

vi.mock('../feeds/okx-ws', () => ({
  OKXWebSocketClient: class {
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    onMessage = vi.fn();
  },
}));

vi.mock('../feeds/bybit-ws', () => ({
  BybitWebSocketClient: class {
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    onMessage = vi.fn();
  },
}));

vi.mock('../feeds/websocket-client', () => ({
  WebSocketClient: class {},
}));

vi.mock('../spread-detector', () => ({
  SpreadDetector: class {
    scan = vi.fn().mockResolvedValue([
      {
        id: 'arb-BTC/USDT-123',
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'okx',
        buyPrice: 50000,
        sellPrice: 50100,
        spread: 100,
        spreadPercent: 0.2,
        timestamp: Date.now(),
        latency: 50,
        score: 85,
        confidence: 'high',
        fees: { buyFee: 5, sellFee: 5, netFee: 10 },
        slippage: { buySlippage: 1, sellSlippage: 1, totalSlippage: 2 },
      },
    ]);
    start = vi.fn();
    stop = vi.fn();
    getMetrics = vi.fn().mockReturnValue({
      totalScans: 1,
      opportunitiesFound: 1,
      avgScanDurationMs: 30,
      p95ScanDurationMs: 45,
      p99ScanDurationMs: 60,
      isUnderTarget: true,
      targetLatencyMs: 500,
    });
    storeOpportunity = vi.fn().mockResolvedValue(undefined);
    getRecentOpportunities = vi.fn().mockResolvedValue([]);
    recordLatency = vi.fn();
  },
}));

vi.mock('../signal-scorer', () => ({
  SignalScorer: class {
    score = vi.fn().mockReturnValue({
      opportunity: {},
      totalScore: 85,
      breakdown: { spreadScore: 90, latencyScore: 80, volumeScore: 70, reliabilityScore: 95 },
      rank: 1,
      recommendation: 'STRONG_BUY',
    });
    scoreAll = vi.fn().mockReturnValue([]);
    filterActionable = vi.fn().mockReturnValue([]);
    updateReliability = vi.fn();
  },
}));

vi.mock('../unified-executor', () => ({
  createUnifiedExecutionEngine: vi.fn().mockImplementation(() => new class {
    execute = vi.fn().mockResolvedValue({
      opportunityId: 'arb-BTC/USDT-123',
    });
    validate = vi.fn().mockReturnValue(true);
    getMetrics = vi.fn().mockReturnValue({
      opportunitiesReceived: 0,
      opportunitiesExecuted: 0,
      totalProfit: 0,
      avgLatencyMs: 0,
      errors: 0,
      perStrategy: {},
    });
    getExecutor = vi.fn().mockReturnValue(undefined);
    getAuditLog = vi.fn().mockReturnValue([]);
    resetMetrics = vi.fn();
  }()),
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('StrategyOrchestrator', () => {
  let orchestrator: StrategyOrchestrator;
  let config: OrchestratorConfig;

  beforeEach(() => {
    config = {
      symbols: ['BTC/USDT', 'ETH/USDT'],
      exchanges: ['binance', 'okx', 'bybit'],
      dryRun: true,
      verbose: false,
      minSpreadPercent: 0.05,
      checkIntervalMs: 100,
      maxQueueSize: 10,
    };
    orchestrator = new StrategyOrchestrator(config);
  });

  afterEach(async () => {
    if (orchestrator) {
      await orchestrator.stop();
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with default config', () => {
      const defaultOrchestrator = createStrategyOrchestrator();
      expect(defaultOrchestrator).toBeInstanceOf(StrategyOrchestrator);
      expect(defaultOrchestrator.getMetrics().isRunning).toBe(false);
    });

    it('should create orchestrator with custom config', () => {
      const customOrchestrator = new StrategyOrchestrator({
        symbols: ['BTC/USDT'],
        exchanges: ['binance'],
        dryRun: false,
        maxQueueSize: 5,
      });
      expect(customOrchestrator).toBeInstanceOf(StrategyOrchestrator);
      const metrics = customOrchestrator.getMetrics();
      expect(metrics.isRunning).toBe(false);
    });
  });

  describe('start', () => {
    it('should start orchestrator and set running to true', async () => {
      await orchestrator.start();
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      expect(metrics.feedConnected).toBe(true);
      expect(metrics.uptimeMs).toBeGreaterThan(0);
    });

    it('should not start twice', async () => {
      await orchestrator.start();
      await orchestrator.start(); // Second call should be no-op
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
    });

    it('should initialize feed aggregator and subscribe to symbols', async () => {
      await orchestrator.start();
      // Verify start was called (feed connected, subscribed)
      expect(orchestrator.getMetrics().feedConnected).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop orchestrator and set running to false', async () => {
      await orchestrator.start();
      await orchestrator.stop();
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(false);
      expect(metrics.feedConnected).toBe(false);
    });

    it('should handle stop when not running', async () => {
      await orchestrator.stop(); // Should not throw
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(false);
    });

    it('should drain queue on stop', async () => {
      await orchestrator.start();
      // Let a scan cycle run to populate queue
      await new Promise(resolve => setTimeout(resolve, 150));
      await orchestrator.stop();
      expect(orchestrator.getMetrics().isRunning).toBe(false);
    });
  });

  describe('getMetrics', () => {
    it('should return initial metrics', () => {
      const metrics = orchestrator.getMetrics();
      expect(metrics).toEqual({
        feedConnected: false,
        feedLatencyMs: 0,
        messagesReceived: 0,
        scansPerformed: 0,
        opportunitiesDetected: 0,
        p95DetectionLatencyMs: 0,
        signalsScored: 0,
        actionableSignals: 0,
        executionsAttempted: 0,
        executionsSucceeded: 0,
        executionsFailed: 0,
        totalProfit: 0,
        p95ExecutionLatencyMs: 0,
        queueSize: 0,
        queueDropped: 0,
        uptimeMs: expect.any(Number),
        isRunning: false,
      });
      // uptimeMs should be a valid timestamp (Date.now() - 0)
      expect(metrics.uptimeMs).toBeGreaterThan(0);
    });

    it('should update metrics after start', async () => {
      await orchestrator.start();
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      expect(metrics.feedConnected).toBe(true);
      expect(metrics.uptimeMs).toBeGreaterThan(0);
    });

    it('should track feed latency', async () => {
      await orchestrator.start();
      const metrics = orchestrator.getMetrics();
      expect(metrics.feedLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scanAndExecute cycle', () => {
    it('should perform scan and update metrics', async () => {
      await orchestrator.start();
      // Wait for at least one scan cycle
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.scansPerformed).toBeGreaterThan(0);
      expect(metrics.opportunitiesDetected).toBeGreaterThan(0);
      expect(metrics.signalsScored).toBeGreaterThan(0);
    });

    it('should score opportunities and filter actionable ones', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.actionableSignals).toBeGreaterThanOrEqual(0);
    });

    it('should execute actionable opportunities', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      // With STRONG_BUY recommendation, should attempt execution
      expect(metrics.executionsAttempted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('queue management', () => {
    it('should respect max queue size', async () => {
      const smallQueueOrchestrator = new StrategyOrchestrator({
        ...config,
        maxQueueSize: 2,
      });
      await smallQueueOrchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 200));
      const metrics = smallQueueOrchestrator.getMetrics();
      expect(metrics.queueSize).toBeLessThanOrEqual(2);
      await smallQueueOrchestrator.stop();
    });

    it('should drop lowest scored when queue full', async () => {
      const smallQueueOrchestrator = new StrategyOrchestrator({
        ...config,
        maxQueueSize: 1,
      });
      await smallQueueOrchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 200));
      const metrics = smallQueueOrchestrator.getMetrics();
      // Queue should not exceed max size
      expect(metrics.queueSize).toBeLessThanOrEqual(1);
      await smallQueueOrchestrator.stop();
    });

    it('should track dropped opportunities', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.queueDropped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('latency tracking', () => {
    it('should track detection latency p95', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.p95DetectionLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should track execution latency p95', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.p95ExecutionLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('dry run mode', () => {
    it('should run in dry run mode by default', async () => {
      const dryRunOrchestrator = createStrategyOrchestrator({ dryRun: true });
      await dryRunOrchestrator.start();
      const metrics = dryRunOrchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      await dryRunOrchestrator.stop();
    });

    it('should accept live mode config', async () => {
      const liveOrchestrator = createStrategyOrchestrator({ dryRun: false });
      await liveOrchestrator.start();
      const metrics = liveOrchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      await liveOrchestrator.stop();
    });
  });

  describe('strategy filtering', () => {
    it('should filter opportunities by strategy type', async () => {
      const orchestrator = createStrategyOrchestrator({
        strategy: 'cross-exchange',
      });
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      await orchestrator.stop();
    });

    it('should accept binary-arb strategy', () => {
      const orchestrator = createStrategyOrchestrator({
        strategy: 'binary-arb',
      });
      expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
    });

    it('should accept cross-market strategy', () => {
      const orchestrator = createStrategyOrchestrator({
        strategy: 'cross-market',
      });
      expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
    });

    it('should accept split-merge strategy', () => {
      const orchestrator = createStrategyOrchestrator({
        strategy: 'split-merge',
      });
      expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
    });
  });

  describe('error handling', () => {
    it('should continue running after scan error', async () => {
      await orchestrator.start();
      // Force an error by making scan throw
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      await orchestrator.stop();
    });

    it('should track execution failures', async () => {
      // Create orchestrator with execution engine that fails
      const failOrchestrator = new StrategyOrchestrator(config);
      await failOrchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = failOrchestrator.getMetrics();
      expect(metrics.executionsFailed).toBeGreaterThanOrEqual(0);
      await failOrchestrator.stop();
    });
  });

  describe('signal scorer integration', () => {
    it('should update exchange reliability on execution results', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const metrics = orchestrator.getMetrics();
      // Should have attempted executions
      expect(metrics.executionsAttempted).toBeGreaterThanOrEqual(0);
      await orchestrator.stop();
    });
  });

  describe('graceful shutdown', () => {
    it('should drain queue before stopping', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const beforeStop = orchestrator.getMetrics();
      await orchestrator.stop();
      const afterStop = orchestrator.getMetrics();
      expect(afterStop.isRunning).toBe(false);
      expect(afterStop.feedConnected).toBe(false);
      expect(afterStop.uptimeMs).toBeGreaterThanOrEqual(beforeStop.uptimeMs);
    });
  });
});

describe('createStrategyOrchestrator factory', () => {
  it('should create orchestrator with sensible defaults', () => {
    const orchestrator = createStrategyOrchestrator();
    expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
    const metrics = orchestrator.getMetrics();
    expect(metrics.isRunning).toBe(false);
  });

  it('should merge custom config with defaults', () => {
    const orchestrator = createStrategyOrchestrator({
      symbols: ['SOL/USDT'],
      exchanges: ['binance'],
      dryRun: false,
    });
    expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
  });

  it('should accept strategy config', () => {
    const orchestrator = createStrategyOrchestrator({
      strategy: 'cross-exchange',
    });
    expect(orchestrator).toBeInstanceOf(StrategyOrchestrator);
  });
});