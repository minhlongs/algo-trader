import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// ─── Hoisted mocks (must be declared before vi.mock calls, which are hoisted) ───
const mockQwenSignalsTotal = { inc: vi.fn() };
const mockRecExtLat = vi.fn();
const mockRecShard = vi.fn();
const mockWinRateGauge = { set: vi.fn() };
const mockSetCb = vi.fn();
const mockSetStrategyActive = vi.fn();
const mock_setStrategyActive = mockSetStrategyActive; // alias for _setStrategyActive import

// Also mock the underlying metric objects that the legacy wrapper calls
const mockCircuitBreakerState = { set: vi.fn() };
const mockStrategyActive = { set: vi.fn() };
const mockExternalApiLatency = { observe: vi.fn() };
const mockShardLatency = { observe: vi.fn() };

// Mock prom-client with proper constructors
const mockRegistry = {
  contentType: 'text/plain; version=0.0.4; charset=utf-8',
  metrics: vi.fn().mockResolvedValue('mocked metrics'),
  registerMetric: vi.fn(),
  removeSingleMetric: vi.fn(),
};

const mockCounterCtor = vi.hoisted(() => vi.fn(function CounterMock() { return { inc: vi.fn(), reset: vi.fn() }; }));
const mockGaugeCtor = vi.hoisted(() => vi.fn(function GaugeMock() { return { set: vi.fn(), inc: vi.fn(), dec: vi.fn(), reset: vi.fn() }; }));
const mockHistogramCtor = vi.hoisted(() => vi.fn(function HistogramMock() { return { observe: vi.fn(), reset: vi.fn() }; }));
const mockRegistryCtor = vi.hoisted(() => vi.fn(function RegistryMock() { return mockRegistry; }));

vi.mock('prom-client', () => ({
  default: {
    Registry: mockRegistryCtor,
    Counter: mockCounterCtor,
    Gauge: mockGaugeCtor,
    Histogram: mockHistogramCtor,
    collectDefaultMetrics: vi.fn(),
  },
}));

// Mock the canonical prometheus-metrics module
vi.mock('../../platform/middleware/prometheus-metrics', () => ({
  register: mockRegistry,
  qwenSignalsTotal: mockQwenSignalsTotal,
  recordExternalApiLatency: mockRecExtLat,
  recordShardLatency: mockRecShard,
  winRatePercent: mockWinRateGauge,
  setCircuitBreakerState: mockSetCb,
  setStrategyActive: mockSetStrategyActive,
  _setStrategyActive: mockSetStrategyActive,
  recordDataGap: vi.fn(),
  recordGapDetectionDuration: vi.fn(),
  setExpectedCandles: vi.fn(),
  setReceivedCandles: vi.fn(),
  setCandleCompleteness: vi.fn(),
  recordOutlierEvent: vi.fn(),
  recordOutlierZScore: vi.fn(),
  recordFailoverEvent: vi.fn(),
  setProviderHealthScore: vi.fn(),
  setProviderAvailability: vi.fn(),
  setProviderErrorRate: vi.fn(),
  recordSlaCompliance: vi.fn(),
  recordQueueWaitTime: vi.fn(),
  recordExternalApiLatency: mockRecExtLat,
  externalApiLatency: mockExternalApiLatency,
  recordTrade: vi.fn(),
  dailyPnlUsd: { set: vi.fn() },
  winRatePercent: mockWinRateGauge,
  qwenPaperPnlPct: { set: vi.fn() },
  qwenSignalsTotal: mockQwenSignalsTotal,
  qwenStrategyReviewsResolvedTotal: { inc: vi.fn() },
  qwenAdminKillActionsTotal: { inc: vi.fn() },
  setQwenKillSwitch: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
  qwenStrategyReviewsQueuedTotal: { inc: vi.fn() },
  qwenSignalsLoopRunsTotal: { inc: vi.fn() },
  qwenSignalsLoopLastRunTs: { set: vi.fn() },
  qwenSignalsLoopJournalWriteErrorsTotal: { inc: vi.fn() },
  qwenStrategyReviewBacklogSize: { set: vi.fn() },
  qwenStrategyReviewOldestPendingAgeSec: { set: vi.fn() },
  setMemoryMetrics: vi.fn(),
  recordMemoryPressureEvent: vi.fn(),
  recordCacheEviction: vi.fn(),
  recordCompressionRatio: vi.fn(),
  setStrategyActive: mockSetStrategyActive,
  // These are the metric objects the legacy file imports with aliases
  circuitBreakerState: mockCircuitBreakerState,
  strategyActive: mockStrategyActive,
  externalApiLatency: mockExternalApiLatency,
  shardLatency: mockShardLatency,
}));

// Mock logger
vi.mock('../../shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('src/middleware/prometheus-metrics.ts', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      method: 'GET',
      path: '/test',
      route: { path: '/test' },
    };
    res = {
      statusCode: 200,
      set: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      on: vi.fn((event, callback) => {
        if (event === 'finish') {
          // Store callback to call manually
          (res as any)._finishCallback = callback;
        }
      }),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('metricsMiddleware', () => {
    it('should call next()', async () => {
      const { metricsMiddleware } = await import('../prometheus-metrics');
      await metricsMiddleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should register finish handler on response', async () => {
      const { metricsMiddleware } = await import('../prometheus-metrics');
      await metricsMiddleware(req as Request, res as Response, next);
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should increment counter and observe histogram on finish', async () => {
      const { metricsMiddleware, httpRequestsTotal, httpRequestDuration } = await import('../prometheus-metrics');
      await metricsMiddleware(req as Request, res as Response, next);

      // Manually trigger finish callback
      const finishCallback = (res as any)._finishCallback;
      if (finishCallback) {
        finishCallback();
      }

      expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
        method: 'GET',
        path: '/test',
        status: '200',
      });
      expect(httpRequestDuration.observe).toHaveBeenCalledWith(
        { method: 'GET', path: '/test' },
        expect.any(Number)
      );
    });

    it('should use req.route.path when available', async () => {
      req = {
        method: 'POST',
        path: '/api/users',
        route: { path: '/api/users/:id' },
      };
      const { metricsMiddleware, httpRequestsTotal } = await import('../prometheus-metrics');
      await metricsMiddleware(req as Request, res as Response, next);

      const finishCallback = (res as any)._finishCallback;
      if (finishCallback) {
        finishCallback();
      }

      expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
        method: 'POST',
        path: '/api/users/:id',
        status: '200',
      });
    });

    it('should fall back to req.path when req.route is undefined', async () => {
      req = {
        method: 'GET',
        path: '/unknown',
        route: undefined,
      };
      const { metricsMiddleware, httpRequestsTotal } = await import('../prometheus-metrics');
      await metricsMiddleware(req as Request, res as Response, next);

      const finishCallback = (res as any)._finishCallback;
      if (finishCallback) {
        finishCallback();
      }

      expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
        method: 'GET',
        path: '/unknown',
        status: '200',
      });
    });

    it('should handle different status codes', async () => {
      res.statusCode = 404;
      const { metricsMiddleware, httpRequestsTotal } = await import('../prometheus-metrics');
      await metricsMiddleware(req as Request, res as Response, next);

      const finishCallback = (res as any)._finishCallback;
      if (finishCallback) {
        finishCallback();
      }

      expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
        method: 'GET',
        path: '/test',
        status: '404',
      });
    });
  });

  describe('getMetrics', () => {
    it('should return metrics from registry', async () => {
      const { getMetrics } = await import('../prometheus-metrics');
      await getMetrics(req as Request, res as Response);

      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      expect(mockRegistry.metrics).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith('mocked metrics');
    });

    it('should handle errors and return 500', async () => {
      mockRegistry.metrics.mockRejectedValueOnce(new Error('Registry error'));
      const { getMetrics } = await import('../prometheus-metrics');
      await getMetrics(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error generating metrics');
    });
  });

  describe('Legacy helper functions', () => {
    it('recordSignal should call qwenSignalsTotal.inc', async () => {
      const { recordSignal } = await import('../prometheus-metrics');
      recordSignal('BTC', 'buy');
      expect(mockQwenSignalsTotal.inc).toHaveBeenCalledWith({ result: 'buy' });
    });

    it('recordExchangeLatency should call recordExternalApiLatency', async () => {
      const { recordExchangeLatency } = await import('../prometheus-metrics');
      recordExchangeLatency('binance', 'order', 0.5);
      expect(mockRecExtLat).toHaveBeenCalledWith('binance', 'order', 'default', 0.5);
    });

    it('recordTradeExecutionTime should call recordShardLatency', async () => {
      const { recordTradeExecutionTime } = await import('../prometheus-metrics');
      recordTradeExecutionTime('binance', 'BTCUSDT', 0.1);
      expect(mockRecShard).toHaveBeenCalledWith('binance', 'BTCUSDT', 0.1);
    });

    it('setWinRate should call winRatePercent.set', async () => {
      const { setWinRate } = await import('../prometheus-metrics');
      setWinRate(0.75);
      expect(mockWinRateGauge.set).toHaveBeenCalledWith({ strategy: 'default' }, 0.75);
    });

    it('setCircuitBreakerState should call setCircuitBreakerState', async () => {
      const { setCircuitBreakerState } = await import('../prometheus-metrics');
      setCircuitBreakerState(true);
      expect(mockSetCb).toHaveBeenCalledWith(true);
    });

    it('setOpenPositions should call setStrategyActive', async () => {
      const { setOpenPositions } = await import('../prometheus-metrics');
      setOpenPositions('BTCUSDT', 'binance', 5);
      expect(mockSetStrategyActive).toHaveBeenCalledWith('BTCUSDT:binance', true);
    });

    it('setOpenPositions should call setStrategyActive with false when count is 0', async () => {
      const { setOpenPositions } = await import('../prometheus-metrics');
      setOpenPositions('BTCUSDT', 'binance', 0);
      expect(mockSetStrategyActive).toHaveBeenCalledWith('BTCUSDT:binance', false);
    });
  });

  describe('exports', () => {
    it('should export register', async () => {
      const mod = await import('../prometheus-metrics');
      expect(mod.register).toBeDefined();
    });
  });
});