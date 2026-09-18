import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrategyOrchestrator, createStrategyOrchestrator, OrchestratorConfig } from '../orchestrator';

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

describe('StrategyOrchestrator Lifecycle', () => {
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
      expect(customOrchestrator.getMetrics().isRunning).toBe(false);
    });
  });

  describe('start', () => {
    it('should start orchestrator and set running to true', async () => {
      await orchestrator.start();
      const metrics = orchestrator.getMetrics();
      expect(metrics.isRunning).toBe(true);
      expect(metrics.feedConnected).toBe(true);
      expect(metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should not start twice', async () => {
      await orchestrator.start();
      await orchestrator.start();
      expect(orchestrator.getMetrics().isRunning).toBe(true);
    });

    it('should initialize feed aggregator and subscribe to symbols', async () => {
      await orchestrator.start();
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
      await orchestrator.stop();
      expect(orchestrator.getMetrics().isRunning).toBe(false);
    });

    it('should drain queue on stop', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      await orchestrator.stop();
      expect(orchestrator.getMetrics().isRunning).toBe(false);
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
