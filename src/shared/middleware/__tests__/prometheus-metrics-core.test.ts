/**
 * Tests for prometheus-metrics-core — covers every exported recording function
 * and lazy-init gauge export by mocking prom-client primitives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMetrics = vi.fn();

const counterInstance = { inc: vi.fn() };
const gaugeInstance = { set: vi.fn() };
const histogramInstance = { observe: vi.fn() };
const registryInstance = { metrics: mockMetrics };

// Real classes so `new Counter(...)` / `new Registry()` work — arrow-function
// vi.fn() mocks throw "is not a constructor".
class RegistryStub {
  metrics = mockMetrics;
  constructor() { registryInstanceRef = this; }
}
let registryInstanceRef: RegistryStub;
class CounterStub { inc = counterInstance.inc; }
class GaugeStub { set = gaugeInstance.set; }
class HistogramStub { observe = histogramInstance.observe; }

vi.mock('prom-client', () => ({
  Registry: RegistryStub,
  Counter: CounterStub,
  Gauge: GaugeStub,
  Histogram: HistogramStub,
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Mod = typeof import('../prometheus-metrics-core');
let mod: Mod;

beforeEach(async () => {
  vi.resetModules();
  // Re-assign instance methods after clearAllMocks wipes them.
  counterInstance.inc = vi.fn();
  gaugeInstance.set = vi.fn();
  histogramInstance.observe = vi.fn();
  mockMetrics.mockReset();
  mod = await import('../prometheus-metrics-core');
  vi.clearAllMocks();
});

describe('data gap + candle metrics', () => {
  it('recordDataGap increments counter with labels', () => {
    mod.recordDataGap('binance', 'BTCUSDT', 5);
    expect(counterInstance.inc).toHaveBeenCalledWith({ provider: 'binance', symbol: 'BTCUSDT', gap_type: 'missing_candle' });
  });

  it('recordGapDetectionDuration observes histogram', () => {
    mod.recordGapDetectionDuration('binance', 'BTCUSDT', 0.5);
    expect(histogramInstance.observe).toHaveBeenCalledWith({ provider: 'binance', symbol: 'BTCUSDT' }, 0.5);
  });

  it('setExpectedCandles sets gauge with symbol+timeframe', () => {
    mod.setExpectedCandles('p', 'BTCUSDT', '1m', 100);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ symbol: 'BTCUSDT', timeframe: '1m' }, 100);
  });

  it('setReceivedCandles sets gauge with symbol+timeframe', () => {
    mod.setReceivedCandles('p', 'BTCUSDT', '1h', 50);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ symbol: 'BTCUSDT', timeframe: '1h' }, 50);
  });

  it('recordOutlierEvent increments counter', () => {
    mod.recordOutlierEvent('BTCUSDT', 'zscore', 'high');
    expect(counterInstance.inc).toHaveBeenCalledWith({ symbol: 'BTCUSDT', outlier_type: 'zscore' });
  });

  it('recordOutlierZScore sets gauge', () => {
    mod.recordOutlierZScore('BTCUSDT', 't', 3.5);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ symbol: 'BTCUSDT' }, 3.5);
  });
});

describe('failover + circuit breaker + SLA + provider health', () => {
  it('recordFailoverEvent increments with from/to/reason', () => {
    mod.recordFailoverEvent('binance', 'okx', 'timeout');
    expect(counterInstance.inc).toHaveBeenCalledWith({ from_provider: 'binance', to_provider: 'okx', reason: 'timeout' });
  });

  it('setCircuitBreakerState sets 1 when open, 0 when closed', () => {
    mod.setCircuitBreakerState('binance', true);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'binance' }, 1);
    mod.setCircuitBreakerState('binance', false);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'binance' }, 0);
  });

  it('setCircuitBreakerStateProvider is an alias', () => {
    mod.setCircuitBreakerStateProvider('okx', true);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'okx' }, 1);
  });

  it('recordSlaCompliance converts boolean to string label', () => {
    mod.recordSlaCompliance('binance', 'premium', true);
    expect(counterInstance.inc).toHaveBeenCalledWith({ provider: 'binance', sla_tier: 'premium', compliant: 'true' });
    mod.recordSlaCompliance('okx', 'basic', false);
    expect(counterInstance.inc).toHaveBeenCalledWith({ provider: 'okx', sla_tier: 'basic', compliant: 'false' });
  });

  it('setProviderHealthScore sets gauge', () => {
    mod.setProviderHealthScore('binance', 0.9, 0.85);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'binance' }, 0.85);
  });

  it('setProviderAvailability sets 1/0', () => {
    mod.setProviderAvailability('binance', 0, true);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'binance' }, 1);
    mod.setProviderAvailability('okx', 0, false);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'okx' }, 0);
  });

  it('setProviderErrorRate sets gauge', () => {
    mod.setProviderErrorRate('binance', 0, 0.02);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ provider: 'binance' }, 0.02);
  });
});

describe('queue + jobs metrics', () => {
  it('recordQueueWaitTime observes histogram', () => {
    mod.recordQueueWaitTime('main', 'high', 2.5);
    expect(histogramInstance.observe).toHaveBeenCalledWith({ queue: 'main', priority: 'high' }, 2.5);
  });

  it('setJobsActive sets gauge', () => {
    mod.setJobsActive('main', 'low', 3);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ queue: 'main', priority: 'low' }, 3);
  });

  it('recordJobCompleted increments counter', () => {
    mod.recordJobCompleted('main', 'success');
    expect(counterInstance.inc).toHaveBeenCalledWith({ queue: 'main', status: 'success' });
  });
});

describe('API request metrics', () => {
  it('recordApiRequest increments with method/path/status', () => {
    mod.recordApiRequest('GET', '/api/health', '200');
    expect(counterInstance.inc).toHaveBeenCalledWith({ method: 'GET', path: '/api/health', status: '200' });
  });

  it('recordApiError increments with method/path', () => {
    mod.recordApiError('POST', '/api/trade');
    expect(counterInstance.inc).toHaveBeenCalledWith({ method: 'POST', path: '/api/trade' });
  });

  it('recordApiRequestDuration converts ms to seconds', () => {
    mod.recordApiRequestDuration('GET', '/api/health', 5000);
    expect(histogramInstance.observe).toHaveBeenCalledWith({ method: 'GET', path: '/api/health' }, 5);
  });

  it('metricsMiddleware records request + duration', () => {
    mod.metricsMiddleware({ method: 'GET', url: '/api/price' }, {}, 1500);
    expect(counterInstance.inc).toHaveBeenCalledWith({ method: 'GET', path: '/api/price', status: '200' });
    expect(histogramInstance.observe).toHaveBeenCalledWith({ method: 'GET', path: '/api/price' }, 1.5);
  });

  it('getMetrics returns register.metrics() result', async () => {
    mockMetrics.mockResolvedValueOnce('metrics-data');
    const result = await mod.getMetrics();
    expect(result).toBe('metrics-data');
    expect(mockMetrics).toHaveBeenCalled();
  });
});

describe('trade + P&L metrics', () => {
  it('recordTrade sets result label based on pnl sign', () => {
    mod.recordTrade('BTC-USD', 'binance', 'buy', 100);
    expect(counterInstance.inc).toHaveBeenCalledWith({ token_id: 'BTC-USD', exchange: 'binance', side: 'buy', result: 'win' });
    mod.recordTrade('ETH-USD', 'okx', 'sell', -50);
    expect(counterInstance.inc).toHaveBeenCalledWith({ token_id: 'ETH-USD', exchange: 'okx', side: 'sell', result: 'loss' });
  });

  it('setDailyPnlUsd sets gauge with empty labels', () => {
    mod.setDailyPnlUsd(1000);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 1000);
  });

  it('setWinRatePercent sets gauge with empty labels', () => {
    mod.setWinRatePercent(75);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 75);
  });
});

describe('external API latency + qwen switches', () => {
  it('recordExternalApiLatency observes histogram with service/endpoint/region', () => {
    mod.recordExternalApiLatency('openrouter', '/api/chat', 'us-east-1', 1.5);
    expect(histogramInstance.observe).toHaveBeenCalledWith({ service: 'openrouter', endpoint: '/api/chat', region: 'us-east-1' }, 1.5);
  });

  it('setQwenKillSwitch sets 1 when active, 0 when inactive', () => {
    mod.setQwenKillSwitch(true);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 1);
    mod.setQwenKillSwitch(false);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 0);
  });

  it('setQwenDrawdownAutoDisabled sets 1 when disabled, 0 when enabled', () => {
    mod.setQwenDrawdownAutoDisabled(true);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 1);
    mod.setQwenDrawdownAutoDisabled(false);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 0);
  });
});

describe('qwen signals + strategy reviews', () => {
  it('recordQwenSignal increments with signal_type/status', () => {
    mod.recordQwenSignal('price', 'matched');
    expect(counterInstance.inc).toHaveBeenCalledWith({ signal_type: 'price', status: 'matched' });
  });

  it('recordQwenStrategyReview increments with resolution', () => {
    mod.recordQwenStrategyReview('approved');
    expect(counterInstance.inc).toHaveBeenCalledWith({ resolution: 'approved' });
  });

  it('recordQwenAdminKillAction increments with action', () => {
    mod.recordQwenAdminKillAction('manual_disable');
    expect(counterInstance.inc).toHaveBeenCalledWith({ action: 'manual_disable' });
  });
});

describe('qwen paper gate + signals loop', () => {
  it('setQwenPaperPnlPct sets gauge', () => {
    mod.setQwenPaperPnlPct(-5.2);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, -5.2);
  });

  it('setQwenPaperGateDaysRemaining sets gauge', () => {
    mod.setQwenPaperGateDaysRemaining(30);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 30);
  });

  it('setQwenSignalsLoopLastRunTs sets gauge', () => {
    mod.setQwenSignalsLoopLastRunTs(1700000000);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 1700000000);
  });

  it('recordQwenSignalsLoopJournalWriteError increments with empty labels', () => {
    mod.recordQwenSignalsLoopJournalWriteError();
    expect(counterInstance.inc).toHaveBeenCalledWith({});
  });
});

describe('qwen strategy review backlog + oldest age', () => {
  it('setQwenStrategyReviewBacklogSize sets gauge', () => {
    mod.setQwenStrategyReviewBacklogSize(5);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 5);
  });

  it('setQwenStrategyReviewOldestPendingAgeSec sets gauge', () => {
    mod.setQwenStrategyReviewOldestPendingAgeSec(3600);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 3600);
  });
});

describe('memory pressure + cache eviction', () => {
  it('setMemoryRssBytes sets gauge', () => {
    mod.setMemoryRssBytes(500000000);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 500000000);
  });

  it('setMemoryHeapBytes sets gauge', () => {
    mod.setMemoryHeapBytes(200000000);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 200000000);
  });

  it('setMemoryMetrics calls both rss and heap setters', () => {
    mod.setMemoryMetrics(100, 50);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 100);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 50);
  });

  it('recordMemoryPressureEvent increments with level', () => {
    mod.recordMemoryPressureEvent('high');
    expect(counterInstance.inc).toHaveBeenCalledWith({ level: 'high' });
  });

  it('recordCacheEviction increments with cache_name', () => {
    mod.recordCacheEviction('orderbook');
    expect(counterInstance.inc).toHaveBeenCalledWith({ cache_name: 'orderbook' });
  });
});

describe('compression + shard latency', () => {
  it('setCompressionRatio sets gauge with empty labels', () => {
    mod.setCompressionRatio(2.5);
    expect(gaugeInstance.set).toHaveBeenCalledWith({}, 2.5);
  });

  it('recordShardLatency observes histogram with shard_id/operation', () => {
    mod.recordShardLatency('shard-1', 'order_place', 0.3);
    expect(histogramInstance.observe).toHaveBeenCalledWith({ shard_id: 'shard-1', operation: 'order_place' }, 0.3);
  });
});

describe('candle completeness + data gaps', () => {
  it('setCandleCompleteness sets gauge with symbol', () => {
    mod.setCandleCompleteness('BTCUSDT', 'p', '1m', 95);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ symbol: 'BTCUSDT' }, 95);
  });

  it('recordDataGapsTotal increments with symbol/provider', () => {
    mod.recordDataGapsTotal('BTCUSDT', 'binance');
    expect(counterInstance.inc).toHaveBeenCalledWith({ symbol: 'BTCUSDT', provider: 'binance' });
  });
});

describe('strategy state + compression ratio (desk)', () => {
  it('setStrategyActive sets 1 when active, 0 when inactive', () => {
    mod.setStrategyActive('momentum', true);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ strategy: 'momentum' }, 1);
    mod.setStrategyActive('momentum', false);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ strategy: 'momentum' }, 0);
  });

  it('recordCompressionRatio sets ratio only when compressedSize > 0', () => {
    mod.recordCompressionRatio('gzip', 1000, 500);
    expect(gaugeInstance.set).toHaveBeenCalledWith({ algorithm: 'gzip' }, 2);
    mod.recordCompressionRatio('gzip', 1000, 0);
    // Should not call set again (compressedSize is 0)
    expect(gaugeInstance.set).toHaveBeenCalledTimes(1);
  });
});

describe('qwen strategy reviews queued + signals loop runs', () => {
  it('recordQwenStrategyReviewsQueued increments with reason', () => {
    mod.recordQwenStrategyReviewsQueued('manual_review');
    expect(counterInstance.inc).toHaveBeenCalledWith({ reason: 'manual_review' });
  });

  it('recordQwenSignalsLoopRun increments with decision', () => {
    mod.recordQwenSignalsLoopRun('proceed');
    expect(counterInstance.inc).toHaveBeenCalledWith({ decision: 'proceed' });
  });
});

describe('lazy-init re-exports', () => {
  it('exports the register', () => {
    expect(mod.register).toBe(registryInstanceRef);
  });
});
