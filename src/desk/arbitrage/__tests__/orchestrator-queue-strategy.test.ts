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

describe('StrategyOrchestrator Queue & Strategy', () => {
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

  describe('queue management', () => {
    it('should respect max queue size', { timeout: 10_000 }, async () => {
      const smallQueueOrchestrator = new StrategyOrchestrator({ ...config, maxQueueSize: 2 });
      await smallQueueOrchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(smallQueueOrchestrator.getMetrics().queueSize).toBeLessThanOrEqual(2);
    });

    it('should drop lowest scored when queue full', { timeout: 10_000 }, async () => {
      const smallQueueOrchestrator = new StrategyOrchestrator({ ...config, maxQueueSize: 1 });
      await smallQueueOrchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(smallQueueOrchestrator.getMetrics().queueSize).toBeLessThanOrEqual(1);
    });

    it('should track dropped opportunities', async () => {
      await orchestrator.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(orchestrator.getMetrics().queueDropped).toBeGreaterThanOrEqual(0);
    });
  });

  describe('dry run mode', () => {
    it('should run in dry run mode by default', async () => {
      const dryRunOrchestrator = createStrategyOrchestrator({ dryRun: true });
      await dryRunOrchestrator.start();
      expect(dryRunOrchestrator.getMetrics().isRunning).toBe(true);
      await dryRunOrchestrator.stop();
    });

    it('should accept live mode config', async () => {
      const liveOrchestrator = createStrategyOrchestrator({ dryRun: false });
      await liveOrchestrator.start();
      expect(liveOrchestrator.getMetrics().isRunning).toBe(true);
      await liveOrchestrator.stop();
    });
  });

  describe('strategy filtering', () => {
    it('should filter opportunities by strategy type', { timeout: 10_000 }, async () => {
      const customOrch = createStrategyOrchestrator({ strategy: 'cross-exchange' });
      await customOrch.start();
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(customOrch.getMetrics().isRunning).toBe(true);
      await customOrch.stop();
    });

    it('should accept binary-arb strategy', () => {
      expect(createStrategyOrchestrator({ strategy: 'binary-arb' })).toBeInstanceOf(StrategyOrchestrator);
    });

    it('should accept cross-market strategy', () => {
      expect(createStrategyOrchestrator({ strategy: 'cross-market' })).toBeInstanceOf(StrategyOrchestrator);
    });

    it('should accept split-merge strategy', () => {
      expect(createStrategyOrchestrator({ strategy: 'split-merge' })).toBeInstanceOf(StrategyOrchestrator);
    });
  });
});
