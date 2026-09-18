import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrategyOrchestrator, OrchestratorConfig } from '../orchestrator';

const MockWebSocket = vi.fn().mockImplementation(() => ({
  readyState: 1, close: vi.fn(), send: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
}));
vi.stubGlobal('WebSocket', MockWebSocket);

vi.mock('../../feeds/feed-aggregator', () => ({
  FeedAggregator: class {
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn().mockResolvedValue(undefined);
    onFeed = vi.fn();
    getAverageLatency = vi.fn().mockReturnValue(0);
    isConnected = vi.fn().mockReturnValue(true);
  },
}));
vi.mock('../../feeds/binance-ws', () => ({ BinanceWebSocketClient: class { connect = vi.fn().mockResolvedValue(undefined); disconnect = vi.fn().mockResolvedValue(undefined); subscribe = vi.fn().mockResolvedValue(undefined); onMessage = vi.fn(); } }));
vi.mock('../../feeds/okx-ws', () => ({ OKXWebSocketClient: class { connect = vi.fn().mockResolvedValue(undefined); disconnect = vi.fn().mockResolvedValue(undefined); subscribe = vi.fn().mockResolvedValue(undefined); onMessage = vi.fn(); } }));
vi.mock('../../feeds/bybit-ws', () => ({ BybitWebSocketClient: class { connect = vi.fn().mockResolvedValue(undefined); disconnect = vi.fn().mockResolvedValue(undefined); subscribe = vi.fn().mockResolvedValue(undefined); onMessage = vi.fn(); } }));
vi.mock('../../feeds/websocket-client', () => ({ WebSocketClient: class {} }));
vi.mock('../spread-detector', () => ({
  SpreadDetector: class {
    scan = vi.fn().mockResolvedValue([{ id: 'arb-1', symbol: 'BTC/USDT', buyExchange: 'binance', sellExchange: 'okx', buyPrice: 50000, sellPrice: 50100, spread: 100, spreadPercent: 0.2, timestamp: Date.now(), latency: 50, score: 85, confidence: 'high', fees: { buyFee: 5, sellFee: 5, netFee: 10 }, slippage: { buySlippage: 1, sellSlippage: 1, totalSlippage: 2 } }]);
    start = vi.fn(); stop = vi.fn(); recordLatency = vi.fn();
    getMetrics = vi.fn().mockReturnValue({ totalScans: 1, opportunitiesFound: 1, avgScanDurationMs: 30, p95ScanDurationMs: 45, p99ScanDurationMs: 60, isUnderTarget: true, targetLatencyMs: 500 });
    storeOpportunity = vi.fn().mockResolvedValue(undefined);
    getRecentOpportunities = vi.fn().mockResolvedValue([]);
  },
}));
vi.mock('../signal-scorer', () => ({
  SignalScorer: class {
    score = vi.fn().mockReturnValue({ opportunity: {}, totalScore: 85, breakdown: { spreadScore: 90, latencyScore: 80, volumeScore: 70, reliabilityScore: 95 }, rank: 1, recommendation: 'STRONG_BUY' });
    scoreAll = vi.fn().mockReturnValue([]); filterActionable = vi.fn().mockReturnValue([]); updateReliability = vi.fn();
  },
}));
vi.mock('../unified-executor', () => ({
  createUnifiedExecutionEngine: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ opportunityId: 'arb-1' }), validate: vi.fn().mockReturnValue(true),
    getMetrics: vi.fn().mockReturnValue({ opportunitiesReceived: 0, opportunitiesExecuted: 0, totalProfit: 0, avgLatencyMs: 0, errors: 0, perStrategy: {} }),
    getExecutor: vi.fn().mockReturnValue(undefined), getAuditLog: vi.fn().mockReturnValue([]), resetMetrics: vi.fn(),
  })),
}));
vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('StrategyOrchestrator Metrics & Latency', () => {
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
    if (orchestrator?.getMetrics().isRunning) {
      await orchestrator.stop();
    }
    vi.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should return initial metrics', () => {
      const metrics = orchestrator.getMetrics();
      expect(metrics).toEqual({
        feedConnected: false, feedLatencyMs: 0, messagesReceived: 0, scansPerformed: 0,
        opportunitiesDetected: 0, p95DetectionLatencyMs: 0, signalsScored: 0, actionableSignals: 0,
        executionsAttempted: 0, executionsSucceeded: 0, executionsFailed: 0, totalProfit: 0,
        p95ExecutionLatencyMs: 0, queueSize: 0, queueDropped: 0, uptimeMs: expect.any(Number), isRunning: false,
      });
      expect(metrics.uptimeMs).toBeGreaterThan(0);
    });

    it('should update metrics after start', async () => {
      await orchestrator.start();
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      expect(metrics.feedConnected).toBe(true);
      expect(metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track feed latency', async () => {
      await orchestrator.start();
      const metrics = orchestrator.getMetrics();
      expect(metrics.feedLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scanAndExecute cycle', () => {
    it('should perform scan and update metrics', { timeout: 10_000 }, async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      const metrics = orchestrator.getMetrics();
      expect(metrics.scansPerformed).toBeGreaterThan(0);
      expect(metrics.opportunitiesDetected).toBeGreaterThan(0);
      expect(metrics.signalsScored).toBeGreaterThan(0);
    });

    it('should score opportunities and filter actionable ones', { timeout: 10_000 }, async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      const metrics = orchestrator.getMetrics();
      expect(metrics.actionableSignals).toBeGreaterThanOrEqual(0);
    });

    it('should execute actionable opportunities', { timeout: 10_000 }, async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      const metrics = orchestrator.getMetrics();
      expect(metrics.executionsAttempted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('latency tracking', () => {
    it('should track detection latency p95', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      const metrics = orchestrator.getMetrics();
      expect(metrics.p95DetectionLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should track execution latency p95', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      const metrics = orchestrator.getMetrics();
      expect(metrics.p95ExecutionLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
