import { Registry, Counter, Gauge, Histogram, CounterConfiguration, GaugeConfiguration, HistogramConfiguration } from 'prom-client';

export const register = new Registry();

// ─── Lazy-init helpers (defer prom-client construction until first call) ──────

let _gapCounter: Counter<string> | undefined;
let _gapDurationHist: Histogram<string> | undefined;
let _expectedGauge: Gauge<string> | undefined;
let _receivedGauge: Gauge<string> | undefined;
let _outlierCounter: Counter<string> | undefined;
let _outlierZScoreGauge: Gauge<string> | undefined;
let _failoverCounter: Counter<string> | undefined;
let _circuitBreakerGauge: Gauge<string> | undefined;
let _healthScoreGauge: Gauge<string> | undefined;
let _availabilityGauge: Gauge<string> | undefined;
let _errorRateGauge: Gauge<string> | undefined;
let _slaCounter: Counter<string> | undefined;
let _candleCompletenessGauge: Gauge<string> | undefined;
let _dataGapsCounter: Counter<string> | undefined;
let _apiRequestCounter: Counter<string> | undefined;
let _apiErrorCounter: Counter<string> | undefined;
let _apiRequestDuration: Histogram<string> | undefined;
let _shardLatencyHist: Histogram<string> | undefined;
let _jobsActiveGauge: Gauge<string> | undefined;
let _jobsCompletedCounter: Counter<string> | undefined;
let _externalApiLatencyHist: Histogram<string> | undefined;
let _queueWaitTimeHist: Histogram<string> | undefined;
let _tradeCounter: Counter<string> | undefined;
let _dailyPnlGauge: Gauge<string> | undefined;
let _winRateGauge: Gauge<string> | undefined;
let _qwenSignalsCounter: Counter<string> | undefined;
let _qwenStrategyReviewsCounter: Counter<string> | undefined;
let _qwenAdminKillActionsCounter: Counter<string> | undefined;
let _qwenPaperPnlPctGauge: Gauge<string> | undefined;
let _qwenKillSwitchGauge: Gauge<string> | undefined;
let _qwenDrawdownAutoDisabledGauge: Gauge<string> | undefined;
let _qwenPaperGateDaysRemainingGauge: Gauge<string> | undefined;
let _memoryRssGauge: Gauge<string> | undefined;
let _memoryHeapGauge: Gauge<string> | undefined;
let _memoryPressureEventCounter: Counter<string> | undefined;
let _cacheEvictionCounter: Counter<string> | undefined;
let _compressionRatioGauge: Gauge<string> | undefined;
let _strategyActiveGauge: Gauge<string> | undefined;

// ══════════════════════════════════════════════════════════════════════════════
//  INTERNAL LAZY-INIT FUNCTIONS — each creates metric on first call only
// ══════════════════════════════════════════════════════════════════════════════

function initCounter(conf: CounterConfiguration<string>): Counter<string> {
  return new Counter({ ...conf, registers: [register] });
}
function initGauge(conf: GaugeConfiguration<string>): Gauge<string> {
  return new Gauge({ ...conf, registers: [register] });
}
function initHistogram(conf: HistogramConfiguration<string>): Histogram<string> {
  return new Histogram({ ...conf, registers: [register] });
}
// ══════════════════════════════════════════════════════════════════════════════
//  CANDLE DATA METRICS — used by src/desk/market-data/gap-detector.ts
// ══════════════════════════════════════════════════════════════════════════════

let _gapCounterConf: CounterConfiguration<string> = {
  name: 'algo_trader_gap_detections_total',
  help: 'Total gap detection events',
  labelNames: ['provider', 'symbol', 'gap_type'],
};
export function recordDataGap(provider: string, symbol: string, _duration: number): void {
  if (!_gapCounter) _gapCounter = initCounter(_gapCounterConf);
  _gapCounter.inc({ provider, symbol, gap_type: 'missing_candle' });
}

let _gapDurationConf: HistogramConfiguration<string> = {
  name: 'algo_trader_gap_detection_duration_seconds',
  help: 'Gap detection latency in seconds',
  labelNames: ['provider', 'symbol'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
};
export function recordGapDetectionDuration(provider: string, symbol: string, durationSeconds: number): void {
  if (!_gapDurationHist) _gapDurationHist = initHistogram(_gapDurationConf);
  _gapDurationHist.observe({ provider, symbol }, durationSeconds);
}

let _expectedGaugeConf: GaugeConfiguration<string> = {
  name: 'algo_trader_expected_candle_count',
  help: 'Expected number of candles in a window',
  labelNames: ['symbol', 'timeframe', 'provider'],
};
export function setExpectedCandles(provider: string, symbol: string, timeframe: string, count: number): void {
  if (!_expectedGauge) _expectedGauge = initGauge(_expectedGaugeConf);
  _expectedGauge.set({ symbol, timeframe, provider }, count);
}

let _receivedGaugeConf: GaugeConfiguration<string> = {
  name: 'algo_trader_received_candle_count',
  help: 'Actual number of candles received in a window',
  labelNames: ['symbol', 'timeframe', 'provider'],
};
export function setReceivedCandles(provider: string, symbol: string, timeframe: string, count: number): void {
  if (!_receivedGauge) _receivedGauge = initGauge(_receivedGaugeConf);
  _receivedGauge.set({ symbol, timeframe, provider }, count);
}

let _candleCompletenessConf: GaugeConfiguration<string> = {
  name: 'algo_trader_candle_completeness_ratio',
  help: 'Candle completeness ratio (0-100)',
  labelNames: ['symbol'],
};
export function setCandleCompleteness(symbol: string, _p: string, _tf: string, ratio: number): void {
  if (!_candleCompletenessGauge) _candleCompletenessGauge = initGauge(_candleCompletenessConf);
  _candleCompletenessGauge.set({ symbol }, ratio);
}

let _dataGapsConf: CounterConfiguration<string> = {
  name: 'algo_trader_data_gaps_total',
  help: 'Total candle data gaps detected',
  labelNames: ['symbol', 'provider'],
};
export function recordDataGapsTotal(symbol: string, provider: string): void {
  if (!_dataGapsCounter) _dataGapsCounter = initCounter(_dataGapsConf);
  _dataGapsCounter.inc({ symbol, provider });
}

// ══════════════════════════════════════════════════════════════════════════════
//  OUTLIER DETECTION METRICS — used by src/desk/market-data/outlier-detection.ts
// ══════════════════════════════════════════════════════════════════════════════

let _outlierCounterConf: CounterConfiguration<string> = {
  name: 'algo_trader_outlier_events_total',
  help: 'Total outlier events detected',
  labelNames: ['symbol', 'outlier_type'],
};
export function recordOutlierEvent(symbol: string, outlierType: string, _severity: string): void {
  if (!_outlierCounter) _outlierCounter = initCounter(_outlierCounterConf);
  _outlierCounter.inc({ symbol, outlier_type: outlierType });
}

let _outlierZScoreConf: GaugeConfiguration<string> = {
  name: 'algo_trader_outlier_zscore',
  help: 'Latest z-score for outlier detection',
  labelNames: ['symbol'],
};
export function recordOutlierZScore(symbol: string, _type: string, zScore: number): void {
  if (!_outlierZScoreGauge) _outlierZScoreGauge = initGauge(_outlierZScoreConf);
  _outlierZScoreGauge.set({ symbol }, zScore);
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROVIDER FAILOVER METRICS — used by src/desk/market-data/provider-failover.ts
// ══════════════════════════════════════════════════════════════════════════════

let _failoverCounterConf: CounterConfiguration<string> = {
  name: 'algo_trader_failover_events_total',
  help: 'Total provider failover events',
  labelNames: ['from_provider', 'to_provider', 'reason'],
};
export function recordFailoverEvent(fromProvider: string, toProvider: string, reason: string): void {
  if (!_failoverCounter) _failoverCounter = initCounter(_failoverCounterConf);
  _failoverCounter.inc({ from_provider: fromProvider, to_provider: toProvider, reason });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CIRCUIT BREAKER METRICS — used by provider-failover.ts and live-execution-guard.ts
// ══════════════════════════════════════════════════════════════════════════════

let _circuitBreakerConf: GaugeConfiguration<string> = {
  name: 'algo_trader_circuit_breaker_open',
  help: 'Circuit breaker state (1=open, 0=closed)',
  labelNames: ['provider'],
};
export function setCircuitBreakerState(provider: string, isOpen: boolean): void {
  if (!_circuitBreakerGauge) _circuitBreakerGauge = initGauge(_circuitBreakerConf);
  _circuitBreakerGauge.set({ provider }, isOpen ? 1 : 0);
}


export const setCircuitBreakerStateProvider = setCircuitBreakerState;
// ══════════════════════════════════════════════════════════════════════════════
//  SLA TRACKER METRICS — used by src/desk/market-data/sla-tracker.ts
// ══════════════════════════════════════════════════════════════════════════════

let _healthScoreConf: GaugeConfiguration<string> = {
  name: 'algo_trader_provider_health_score',
  help: 'Provider health score (0-100)',
  labelNames: ['provider'],
};
export function setProviderHealthScore(provider: string, _windowHours: number, score: number): void {
  if (!_healthScoreGauge) _healthScoreGauge = initGauge(_healthScoreConf);
  _healthScoreGauge.set({ provider }, score);
}

let _availabilityConf: GaugeConfiguration<string> = {
  name: 'algo_trader_provider_availability',
  help: 'Provider availability ratio (0-1)',
  labelNames: ['provider'],
};
export function setProviderAvailability(provider: string, _windowHours: number, available: boolean): void {
  if (!_availabilityGauge) _availabilityGauge = initGauge(_availabilityConf);
  _availabilityGauge.set({ provider }, available ? 1 : 0);
}

let _errorRateConf: GaugeConfiguration<string> = {
  name: 'algo_trader_provider_error_rate',
  help: 'Provider error rate (0-1)',
  labelNames: ['provider'],
};
export function setProviderErrorRate(provider: string, _windowHours: number, errorRate: number): void {
  if (!_errorRateGauge) _errorRateGauge = initGauge(_errorRateConf);
  _errorRateGauge.set({ provider }, errorRate);
}

let _slaCounterConf: CounterConfiguration<string> = {
  name: 'algo_trader_sla_compliance_total',
  help: 'SLA compliance checks',
  labelNames: ['provider', 'sla_tier', 'compliant'],
};
export function recordSlaCompliance(provider: string, _windowHours: number, compliant: boolean): void {
  if (!_slaCounter) _slaCounter = initCounter(_slaCounterConf);
  _slaCounter.inc({ provider, sla_tier: 'default', compliant: compliant ? 'true' : 'false' });
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHARD LATENCY — used by src/desk/strategies/router.ts
// ══════════════════════════════════════════════════════════════════════════════

let _shardLatencyConf: HistogramConfiguration<string> = {
  name: 'algo_trader_shard_latency_seconds',
  help: 'Shard execution latency in seconds',
  labelNames: ['shard_id', 'operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
};
export function recordShardLatency(shardId: string, operation: string, latencySeconds: number): void {
  if (!_shardLatencyHist) _shardLatencyHist = initHistogram(_shardLatencyConf);
  _shardLatencyHist.observe({ shard_id: shardId, operation }, latencySeconds);
}

// ══════════════════════════════════════════════════════════════════════════════
//  BULLMQ QUEUE METRICS — used by agent-queue-manager.ts, agent-coordinator.ts
// ══════════════════════════════════════════════════════════════════════════════

let _queueWaitTimeConf: HistogramConfiguration<string> = {
  name: 'algo_trader_queue_wait_time_seconds',
  help: 'Time jobs spend waiting in BullMQ queue',
  labelNames: ['queue', 'priority'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
};
export function recordQueueWaitTime(queue: string, priority: string, waitSeconds: number): void {
  if (!_queueWaitTimeHist) _queueWaitTimeHist = initHistogram(_queueWaitTimeConf);
  _queueWaitTimeHist.observe({ queue, priority }, waitSeconds);
}

let _jobsActiveConf: GaugeConfiguration<string> = {
  name: 'algo_trader_jobs_active',
  help: 'Currently active BullMQ jobs',
  labelNames: ['queue', 'priority'],
};
export function setJobsActive(queue: string, priority: string, count: number): void {
  if (!_jobsActiveGauge) _jobsActiveGauge = initGauge(_jobsActiveConf);
  _jobsActiveGauge.set({ queue, priority }, count);
}

let _jobsCompletedConf: CounterConfiguration<string> = {
  name: 'algo_trader_jobs_completed_total',
  help: 'Total completed BullMQ jobs',
  labelNames: ['queue', 'status'],
};
export function recordJobCompleted(queue: string, status: string): void {
  if (!_jobsCompletedCounter) _jobsCompletedCounter = initCounter(_jobsCompletedConf);
  _jobsCompletedCounter.inc({ queue, status });
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXTERNAL API LATENCY — used by latency-monitor.ts, polymarket-adapter.ts
// ══════════════════════════════════════════════════════════════════════════════

let _externalApiLatencyConf: HistogramConfiguration<string> = {
  name: 'algo_trader_external_api_latency_seconds',
  help: 'External API call latency in seconds',
  labelNames: ['service', 'endpoint', 'region'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
};
export function recordExternalApiLatency(service: string, endpoint: string, region: string, latencySeconds: number): void {
  if (!_externalApiLatencyHist) _externalApiLatencyHist = initHistogram(_externalApiLatencyConf);
  _externalApiLatencyHist.observe({ service, endpoint, region }, latencySeconds);
}
export const externalApiLatency: Histogram<string> = _externalApiLatencyHist as Histogram<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  API MIDDLEWARE METRICS — used by HTTP middleware
// ══════════════════════════════════════════════════════════════════════════════

let _apiRequestConf: CounterConfiguration<string> = {
  name: 'algo_trader_api_requests_total',
  help: 'Total API requests',
  labelNames: ['method', 'path', 'status'],
};
export function recordApiRequest(method: string, path: string, status: string): void {
  if (!_apiRequestCounter) _apiRequestCounter = initCounter(_apiRequestConf);
  _apiRequestCounter.inc({ method, path, status });
}

let _apiErrorConf: CounterConfiguration<string> = {
  name: 'algo_trader_api_errors_total',
  help: 'Total API errors',
  labelNames: ['method', 'path'],
};
export function recordApiError(method: string, path: string): void {
  if (!_apiErrorCounter) _apiErrorCounter = initCounter(_apiErrorConf);
  _apiErrorCounter.inc({ method, path });
}

let _apiDurationConf: HistogramConfiguration<string> = {
  name: 'algo_trader_api_request_duration_seconds',
  help: 'API request latency in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
};
export function recordApiRequestDuration(method: string, path: string, durationMs: number): void {
  if (!_apiRequestDuration) _apiRequestDuration = initHistogram(_apiDurationConf);
  _apiRequestDuration.observe({ method, path }, durationMs / 1000);
}

export function metricsMiddleware(req: { method: string; url: string }, _res: unknown, durationMs: number): void {
  const method = req.method;
  const path = req.url;
  recordApiRequest(method, path, '200');
  recordApiRequestDuration(method, path, durationMs);
}

export function getMetrics(): Promise<string> {
  return register.metrics();
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRADE TRACKING METRICS — used by live-position-tracker.ts
// ══════════════════════════════════════════════════════════════════════════════

let _tradeCounterConf: CounterConfiguration<string> = {
  name: 'algo_trader_trades_total',
  help: 'Total trades executed',
  labelNames: ['token_id', 'exchange', 'side', 'result'],
};
export function recordTrade(tokenId: string, exchange: string, side: 'buy' | 'sell', pnl: number): void {
  if (!_tradeCounter) _tradeCounter = initCounter(_tradeCounterConf);
  _tradeCounter.inc({ token_id: tokenId, exchange, side, result: pnl >= 0 ? 'win' : 'loss' });
}

let _dailyPnlConf: GaugeConfiguration<string> = {
  name: 'algo_trader_daily_pnl_usd',
  help: 'Daily P&L in USD',
  labelNames: ['strategy'],
};
export function setDailyPnlUsd(strategy: string, pnl: number): void {
  if (!_dailyPnlGauge) _dailyPnlGauge = initGauge(_dailyPnlConf);
  _dailyPnlGauge.set({ strategy }, pnl);
}
export const dailyPnlUsd: Gauge<string> = _dailyPnlGauge as Gauge<string>;

let _winRateConf: GaugeConfiguration<string> = {
  name: 'algo_trader_win_rate_percent',
  help: 'Win rate percentage (0-100)',
  labelNames: ['strategy'],
};
export function setWinRatePercent(strategy: string, rate: number): void {
  if (!_winRateGauge) _winRateGauge = initGauge(_winRateConf);
  _winRateGauge.set({ strategy }, rate);
}
export const winRatePercent: Gauge<string> = _winRateGauge as Gauge<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN STRATEGY METRICS — used by rollback/tiered-rollback-controller.ts
// ══════════════════════════════════════════════════════════════════════════════

let _qwenPaperPnlPctConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_paper_pnl_pct',
  help: 'Qwen paper trading P&L percentage',
  labelNames: ['period'],
};
export function setQwenPaperPnlPct(period: string, pct: number): void {
  if (!_qwenPaperPnlPctGauge) _qwenPaperPnlPctGauge = initGauge(_qwenPaperPnlPctConf);
  _qwenPaperPnlPctGauge.set({ period }, pct);
}
export const qwenPaperPnlPct: Gauge<string> = _qwenPaperPnlPctGauge as Gauge<string>;

let _qwenSignalsConf: CounterConfiguration<string> = {
  name: 'algo_trader_qwen_signals_total',
  help: 'Total Qwen signals received',
  labelNames: ['signal_type', 'status'],
};
export function recordQwenSignal(signalType: string, status: string): void {
  if (!_qwenSignalsCounter) _qwenSignalsCounter = initCounter(_qwenSignalsConf);
  _qwenSignalsCounter.inc({ signal_type: signalType, status });
}
export const qwenSignalsTotal: Counter<string> = _qwenSignalsCounter as Counter<string>;

let _qwenStrategyReviewsConf: CounterConfiguration<string> = {
  name: 'algo_trader_qwen_strategy_reviews_resolved_total',
  help: 'Total Qwen strategy reviews resolved',
  labelNames: ['resolution'],
};
export function recordQwenStrategyReview(resolution: string): void {
  if (!_qwenStrategyReviewsCounter) _qwenStrategyReviewsCounter = initCounter(_qwenStrategyReviewsConf);
  _qwenStrategyReviewsCounter.inc({ resolution });
}
export const qwenStrategyReviewsResolvedTotal: Counter<string> = _qwenStrategyReviewsCounter as Counter<string>;

let _qwenAdminKillActionsConf: CounterConfiguration<string> = {
  name: 'algo_trader_qwen_admin_kill_actions_total',
  help: 'Total admin kill actions on Qwen',
  labelNames: ['action'],
};
export function recordQwenAdminKillAction(action: string): void {
  if (!_qwenAdminKillActionsCounter) _qwenAdminKillActionsCounter = initCounter(_qwenAdminKillActionsConf);
  _qwenAdminKillActionsCounter.inc({ action });
}
export const qwenAdminKillActionsTotal: Counter<string> = _qwenAdminKillActionsCounter as Counter<string>;

let _qwenKillSwitchConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_kill_switch',
  help: 'Qwen kill switch state (1=active, 0=inactive)',
  labelNames: [],
};
export function setQwenKillSwitch(active: boolean): void {
  if (!_qwenKillSwitchGauge) _qwenKillSwitchGauge = initGauge(_qwenKillSwitchConf);
  _qwenKillSwitchGauge.set({}, active ? 1 : 0);
}

let _qwenDrawdownAutoDisabledConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_drawdown_auto_disabled',
  help: 'Qwen drawdown auto-disable state (1=disabled, 0=active)',
  labelNames: [],
};
export function setQwenDrawdownAutoDisabled(disabled: boolean): void {
  if (!_qwenDrawdownAutoDisabledGauge) _qwenDrawdownAutoDisabledGauge = initGauge(_qwenDrawdownAutoDisabledConf);
  _qwenDrawdownAutoDisabledGauge.set({}, disabled ? 1 : 0);
}

let _qwenPaperGateDaysRemainingConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_paper_gate_days_remaining',
  help: 'Days remaining before Qwen paper gate lifts',
  labelNames: [],
};
export function setQwenPaperGateDaysRemaining(days: number): void {
  if (!_qwenPaperGateDaysRemainingGauge) _qwenPaperGateDaysRemainingGauge = initGauge(_qwenPaperGateDaysRemainingConf);
  _qwenPaperGateDaysRemainingGauge.set({}, days);
}

// ══════════════════════════════════════════════════════════════════════════════
//  MEMORY PRESSURE METRICS — used by memory-pressure-handler.ts
// ══════════════════════════════════════════════════════════════════════════════

let _memoryRssConf: GaugeConfiguration<string> = {
  name: 'algo_trader_memory_rss_bytes',
  help: 'Process RSS memory in bytes',
  labelNames: [],
};
export function setMemoryRssBytes(bytes: number): void {
  if (!_memoryRssGauge) _memoryRssGauge = initGauge(_memoryRssConf);
  _memoryRssGauge.set({}, bytes);
}

let _memoryHeapConf: GaugeConfiguration<string> = {
  name: 'algo_trader_memory_heap_used_bytes',
  help: 'V8 heap used bytes',
  labelNames: [],
};
export function setMemoryHeapBytes(bytes: number): void {
  if (!_memoryHeapGauge) _memoryHeapGauge = initGauge(_memoryHeapConf);
  _memoryHeapGauge.set({}, bytes);
}

// Combined setter matching caller signature: setMemoryMetrics(rss, heapUsed)
export function setMemoryMetrics(rss: number, heapUsed: number): void {
  setMemoryRssBytes(rss);
  setMemoryHeapBytes(heapUsed);
}

let _memoryPressureEventConf: CounterConfiguration<string> = {
  name: 'algo_trader_memory_pressure_events_total',
  help: 'Total memory pressure events detected',
  labelNames: ['level'],
};
export function recordMemoryPressureEvent(level: string): void {
  if (!_memoryPressureEventCounter) _memoryPressureEventCounter = initCounter(_memoryPressureEventConf);
  _memoryPressureEventCounter.inc({ level });
}

let _cacheEvictionConf: CounterConfiguration<string> = {
  name: 'algo_trader_cache_eviction_total',
  help: 'Total cache eviction events',
  labelNames: ['cache_name'],
};
export function recordCacheEviction(cacheName: string): void {
  if (!_cacheEvictionCounter) _cacheEvictionCounter = initCounter(_cacheEvictionConf);
  _cacheEvictionCounter.inc({ cache_name: cacheName });
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPRESSION METRICS — used by compression-stream.ts
// ══════════════════════════════════════════════════════════════════════════════

let _compressionRatioConf: GaugeConfiguration<string> = {
  name: 'algo_trader_compression_ratio',
  help: 'Compression ratio (original/compressed)',
  labelNames: ['algorithm'],
};
export function recordCompressionRatio(algorithm: string, originalSize: number, compressedSize: number): void {
  if (!_compressionRatioGauge) _compressionRatioGauge = initGauge(_compressionRatioConf);
  if (compressedSize > 0) {
    _compressionRatioGauge.set({ algorithm }, originalSize / compressedSize);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  STRATEGY STATE — used by live-trading-orchestrator.ts
// ══════════════════════════════════════════════════════════════════════════════

let _strategyActiveConf: GaugeConfiguration<string> = {
  name: 'algo_trader_strategy_active',
  help: 'Whether a strategy is currently active (1=yes, 0=no)',
  labelNames: ['strategy'],
};
export function setStrategyActive(strategy: string, active: boolean): void {
  if (!_strategyActiveGauge) _strategyActiveGauge = initGauge(_strategyActiveConf);
  _strategyActiveGauge.set({ strategy }, active ? 1 : 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// QWEN SIGNALS LOOP METRICS — used by src/desk/wiring/qwen-signals-loop.ts
// ══════════════════════════════════════════════════════════════════════════════

let _qwenStrategyReviewsQueuedCounter: Counter<string> | undefined;
let _qwenStrategyReviewsQueuedConf: CounterConfiguration<string> = {
  name: 'algo_trader_qwen_strategy_reviews_queued_total',
  help: 'Total Qwen strategy review tasks queued for human review',
  labelNames: ['reason'],
};
export function recordQwenStrategyReviewsQueued(reason: string): void {
  if (!_qwenStrategyReviewsQueuedCounter) _qwenStrategyReviewsQueuedCounter = initCounter(_qwenStrategyReviewsQueuedConf);
  _qwenStrategyReviewsQueuedCounter.inc({ reason });
}
export const qwenStrategyReviewsQueuedTotal: Counter<string> = _qwenStrategyReviewsQueuedCounter as Counter<string>;

let _qwenSignalsLoopRunsCounter: Counter<string> | undefined;
let _qwenSignalsLoopRunsConf: CounterConfiguration<string> = {
  name: 'algo_trader_qwen_signals_loop_runs_total',
  help: 'Total Qwen signals loop executions',
  labelNames: ['decision'],
};
export function recordQwenSignalsLoopRun(decision: string): void {
  if (!_qwenSignalsLoopRunsCounter) _qwenSignalsLoopRunsCounter = initCounter(_qwenSignalsLoopRunsConf);
  _qwenSignalsLoopRunsCounter.inc({ decision });
}
export const qwenSignalsLoopRunsTotal: Counter<string> = _qwenSignalsLoopRunsCounter as Counter<string>;

let _qwenSignalsLoopLastRunTsGauge: Gauge<string> | undefined;
let _qwenSignalsLoopLastRunTsConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_signals_loop_last_run_ts',
  help: 'Unix timestamp of last Qwen signals loop run',
  labelNames: [],
};
export function setQwenSignalsLoopLastRunTs(epochSec: number): void {
  if (!_qwenSignalsLoopLastRunTsGauge) _qwenSignalsLoopLastRunTsGauge = initGauge(_qwenSignalsLoopLastRunTsConf);
  _qwenSignalsLoopLastRunTsGauge.set({}, epochSec);
}
export const qwenSignalsLoopLastRunTs: Gauge<string> = _qwenSignalsLoopLastRunTsGauge as Gauge<string>;

let _qwenSignalsLoopJournalWriteErrorsCounter: Counter<string> | undefined;
let _qwenSignalsLoopJournalWriteErrorsConf: CounterConfiguration<string> = {
  name: 'algo_trader_qwen_signals_loop_journal_write_errors_total',
  help: 'Total journal write errors in Qwen signals loop',
  labelNames: [],
};
export function recordQwenSignalsLoopJournalWriteError(): void {
  if (!_qwenSignalsLoopJournalWriteErrorsCounter) _qwenSignalsLoopJournalWriteErrorsCounter = initCounter(_qwenSignalsLoopJournalWriteErrorsConf);
  _qwenSignalsLoopJournalWriteErrorsCounter.inc({});
}
export const qwenSignalsLoopJournalWriteErrorsTotal: Counter<string> = _qwenSignalsLoopJournalWriteErrorsCounter as Counter<string>;

let _qwenStrategyReviewBacklogSizeGauge: Gauge<string> | undefined;
let _qwenStrategyReviewBacklogSizeConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_strategy_review_backlog_size',
  help: 'Current number of pending strategy review tasks',
  labelNames: [],
};
export function setQwenStrategyReviewBacklogSize(count: number): void {
  if (!_qwenStrategyReviewBacklogSizeGauge) _qwenStrategyReviewBacklogSizeGauge = initGauge(_qwenStrategyReviewBacklogSizeConf);
  _qwenStrategyReviewBacklogSizeGauge.set({}, count);
}
export const qwenStrategyReviewBacklogSize: Gauge<string> = _qwenStrategyReviewBacklogSizeGauge as Gauge<string>;

let _qwenStrategyReviewOldestPendingAgeGauge: Gauge<string> | undefined;
let _qwenStrategyReviewOldestPendingAgeConf: GaugeConfiguration<string> = {
  name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec',
  help: 'Age in seconds of the oldest pending strategy review task',
  labelNames: [],
};
export function setQwenStrategyReviewOldestPendingAgeSec(ageSec: number): void {
  if (!_qwenStrategyReviewOldestPendingAgeGauge) _qwenStrategyReviewOldestPendingAgeGauge = initGauge(_qwenStrategyReviewOldestPendingAgeConf);
  _qwenStrategyReviewOldestPendingAgeGauge.set({}, ageSec);
}
export const qwenStrategyReviewOldestPendingAgeSec: Gauge<string> = _qwenStrategyReviewOldestPendingAgeGauge as Gauge<string>;
