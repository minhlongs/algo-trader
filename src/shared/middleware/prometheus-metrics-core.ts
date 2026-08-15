/**
 * Prometheus Metrics — Shared Core (lazy-init pattern)
 *
 * Single source of truth for desk/deck metric definitions, configurations,
 * and recording functions. Each layer re-exports to preserve import paths.
 */
import {
  Registry, Counter, Gauge, Histogram,
  CounterConfiguration, GaugeConfiguration, HistogramConfiguration,
} from 'prom-client';

export const register = new Registry();

// ─── Lazy-init backing variables ─────────────────────────────────────────────

let _gapCounter: Counter<string> | undefined;
let _gapDurHist: Histogram<string> | undefined;
let _expectedGauge: Gauge<string> | undefined;
let _receivedGauge: Gauge<string> | undefined;
let _outlierCounter: Counter<string> | undefined;
let _outlierZGauge: Gauge<string> | undefined;
let _failoverCounter: Counter<string> | undefined;
let _cbGauge: Gauge<string> | undefined;
let _healthGauge: Gauge<string> | undefined;
let _availGauge: Gauge<string> | undefined;
let _errorRateGauge: Gauge<string> | undefined;
let _slaCounter: Counter<string> | undefined;
let _queueWaitHist: Histogram<string> | undefined;
let _jobsActiveGauge: Gauge<string> | undefined;
let _jobsDoneCounter: Counter<string> | undefined;
let _apiReqCounter: Counter<string> | undefined;
let _apiErrCounter: Counter<string> | undefined;
let _apiDurHist: Histogram<string> | undefined;
let _tradeCounter: Counter<string> | undefined;
let _dailyPnlGauge: Gauge<string> | undefined;
let _winRateGauge: Gauge<string> | undefined;
let _qSigCounter: Counter<string> | undefined;
let _qReviewCounter: Counter<string> | undefined;
let _qKillCounter: Counter<string> | undefined;
let _qPaperPnlGauge: Gauge<string> | undefined;
let _qPaperGateGauge: Gauge<string> | undefined;
let _qLoopTsGauge: Gauge<string> | undefined;
let _qJournalErrCounter: Counter<string> | undefined;
let _qBacklogGauge: Gauge<string> | undefined;
let _qOldestAgeGauge: Gauge<string> | undefined;
let _memRssGauge: Gauge<string> | undefined;
let _memHeapGauge: Gauge<string> | undefined;
let _memPressCounter: Counter<string> | undefined;
let _cacheEvictCounter: Counter<string> | undefined;
let _compRatioGauge: Gauge<string> | undefined;
let _extApiHist: Histogram<string> | undefined;
let _shardHist: Histogram<string> | undefined;

function initCounter(c: CounterConfiguration<string>): Counter<string> {
  return new Counter({ ...c, registers: [register] });
}
function initGauge(c: GaugeConfiguration<string>): Gauge<string> {
  return new Gauge({ ...c, registers: [register] });
}
function initHistogram(c: HistogramConfiguration<string>): Histogram<string> {
  return new Histogram({ ...c, registers: [register] });
}

// ══════════════════════════════════════════════════════════════════════════════
//  CANDLE DATA — gap-detector.ts
// ══════════════════════════════════════════════════════════════════════════════

const C_GAP: CounterConfiguration<string> = { name: 'algo_trader_gap_detections_total', help: 'Total gap detection events', labelNames: ['provider', 'symbol', 'gap_type'] };
export function recordDataGap(provider: string, symbol: string, _d: number): void { if (!_gapCounter) _gapCounter = initCounter(C_GAP); _gapCounter.inc({ provider, symbol, gap_type: 'missing_candle' }); }

const H_GAP_DUR: HistogramConfiguration<string> = { name: 'algo_trader_gap_detection_duration_seconds', help: 'Gap detection duration', labelNames: ['provider', 'symbol'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1] };
export function recordGapDetectionDuration(provider: string, symbol: string, dur: number): void { if (!_gapDurHist) _gapDurHist = initHistogram(H_GAP_DUR); _gapDurHist.observe({ provider, symbol }, dur); }

const G_EXPECTED: GaugeConfiguration<string> = { name: 'algo_trader_expected_candles', help: 'Expected candle count', labelNames: ['symbol', 'timeframe'] };
export function setExpectedCandles(_p: string, symbol: string, tf: string, count: number): void { if (!_expectedGauge) _expectedGauge = initGauge(G_EXPECTED); _expectedGauge.set({ symbol, timeframe: tf }, count); }

const G_RECEIVED: GaugeConfiguration<string> = { name: 'algo_trader_received_candles', help: 'Received candle count', labelNames: ['symbol', 'timeframe'] };
export function setReceivedCandles(_p: string, symbol: string, tf: string, count: number): void { if (!_receivedGauge) _receivedGauge = initGauge(G_RECEIVED); _receivedGauge.set({ symbol, timeframe: tf }, count); }

const C_OUTLIER: CounterConfiguration<string> = { name: 'algo_trader_outlier_events_total', help: 'Outlier events detected', labelNames: ['symbol', 'outlier_type'] };
export function recordOutlierEvent(symbol: string, outlierType: string, _sev: string): void { if (!_outlierCounter) _outlierCounter = initCounter(C_OUTLIER); _outlierCounter.inc({ symbol, outlier_type: outlierType }); }

const G_OUTLIER_Z: GaugeConfiguration<string> = { name: 'algo_trader_outlier_zscore', help: 'Latest outlier z-score', labelNames: ['symbol'] };
export function recordOutlierZScore(symbol: string, _t: string, z: number): void { if (!_outlierZGauge) _outlierZGauge = initGauge(G_OUTLIER_Z); _outlierZGauge.set({ symbol }, z); }

// ══════════════════════════════════════════════════════════════════════════════
//  FAILOVER + CIRCUIT BREAKER + SLA + ERROR RATE
// ══════════════════════════════════════════════════════════════════════════════

const C_FAILOVER: CounterConfiguration<string> = { name: 'algo_trader_failover_events_total', help: 'Total provider failover events', labelNames: ['from_provider', 'to_provider', 'reason'] };
export function recordFailoverEvent(from: string, to: string, reason: string): void { if (!_failoverCounter) _failoverCounter = initCounter(C_FAILOVER); _failoverCounter.inc({ from_provider: from, to_provider: to, reason }); }

const G_CB: GaugeConfiguration<string> = { name: 'algo_trader_circuit_breaker_open', help: 'Circuit breaker state (1=open)', labelNames: ['provider'] };
export function setCircuitBreakerState(provider: string, isOpen: boolean): void { if (!_cbGauge) _cbGauge = initGauge(G_CB); _cbGauge.set({ provider }, isOpen ? 1 : 0); }
export const setCircuitBreakerStateProvider = setCircuitBreakerState;

const C_SLA: CounterConfiguration<string> = { name: 'algo_trader_sla_compliance_total', help: 'SLA compliance checks', labelNames: ['provider', 'sla_tier', 'compliant'] };
export function recordSlaCompliance(provider: string, tier: string, ok: boolean): void { if (!_slaCounter) _slaCounter = initCounter(C_SLA); _slaCounter.inc({ provider, sla_tier: tier, compliant: String(ok) }); }

const G_HEALTH: GaugeConfiguration<string> = { name: 'algo_trader_provider_health_score', help: 'Provider health score (0-1)', labelNames: ['provider'] };
export function setProviderHealthScore(provider: string, _w: number, score: number): void { if (!_healthGauge) _healthGauge = initGauge(G_HEALTH); _healthGauge.set({ provider }, score); }

const G_AVAIL: GaugeConfiguration<string> = { name: 'algo_trader_provider_availability', help: 'Provider availability (0-1)', labelNames: ['provider'] };
export function setProviderAvailability(provider: string, _w: number, available: boolean): void { if (!_availGauge) _availGauge = initGauge(G_AVAIL); _availGauge.set({ provider }, available ? 1 : 0); }

const G_ERR_RATE: GaugeConfiguration<string> = { name: 'algo_trader_provider_error_rate', help: 'Provider error rate (0-1)', labelNames: ['provider'] };
export function setProviderErrorRate(provider: string, _w: number, rate: number): void { if (!_errorRateGauge) _errorRateGauge = initGauge(G_ERR_RATE); _errorRateGauge.set({ provider }, rate); }

// ══════════════════════════════════════════════════════════════════════════════
//  QUEUE + JOBS — BullMQ
// ══════════════════════════════════════════════════════════════════════════════

const H_QUEUE: HistogramConfiguration<string> = { name: 'algo_trader_queue_wait_seconds', help: 'Queue wait time', labelNames: ['queue', 'priority'], buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300] };
export function recordQueueWaitTime(queue: string, priority: string, waitSec: number): void { if (!_queueWaitHist) _queueWaitHist = initHistogram(H_QUEUE); _queueWaitHist.observe({ queue, priority }, waitSec); }

const G_JOBS_ACTIVE: GaugeConfiguration<string> = { name: 'algo_trader_jobs_active', help: 'Active BullMQ jobs', labelNames: ['queue', 'priority'] };
export function setJobsActive(queue: string, priority: string, count: number): void { if (!_jobsActiveGauge) _jobsActiveGauge = initGauge(G_JOBS_ACTIVE); _jobsActiveGauge.set({ queue, priority }, count); }

const C_JOBS_DONE: CounterConfiguration<string> = { name: 'algo_trader_jobs_completed_total', help: 'Completed BullMQ jobs', labelNames: ['queue', 'status'] };
export function recordJobCompleted(queue: string, status: string): void { if (!_jobsDoneCounter) _jobsDoneCounter = initCounter(C_JOBS_DONE); _jobsDoneCounter.inc({ queue, status }); }

// ══════════════════════════════════════════════════════════════════════════════
//  API REQUEST TRACKING
// ══════════════════════════════════════════════════════════════════════════════

const C_API_REQ: CounterConfiguration<string> = { name: 'algo_trader_api_requests_total', help: 'Total API requests', labelNames: ['method', 'path', 'status'] };
export function recordApiRequest(method: string, path: string, status: string): void { if (!_apiReqCounter) _apiReqCounter = initCounter(C_API_REQ); _apiReqCounter.inc({ method, path, status }); }

const C_API_ERR: CounterConfiguration<string> = { name: 'algo_trader_api_errors_total', help: 'Total API errors', labelNames: ['method', 'path'] };
export function recordApiError(method: string, path: string): void { if (!_apiErrCounter) _apiErrCounter = initCounter(C_API_ERR); _apiErrCounter.inc({ method, path }); }

const H_API_DUR: HistogramConfiguration<string> = { name: 'algo_trader_api_request_duration_seconds', help: 'API request latency', labelNames: ['method', 'path'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] };
export function recordApiRequestDuration(method: string, path: string, durMs: number): void { if (!_apiDurHist) _apiDurHist = initHistogram(H_API_DUR); _apiDurHist.observe({ method, path }, durMs / 1000); }

export function metricsMiddleware(req: { method: string; url: string }, _r: unknown, durMs: number): void {
  recordApiRequest(req.method, req.url, '200');
  recordApiRequestDuration(req.method, req.url, durMs);
}

export function getMetrics(): Promise<string> { return register.metrics(); }

// ══════════════════════════════════════════════════════════════════════════════
//  TRADE TRACKING — live-position-tracker.ts
// ══════════════════════════════════════════════════════════════════════════════

const C_TRADE: CounterConfiguration<string> = { name: 'algo_trader_trades_total', help: 'Total trades executed', labelNames: ['token_id', 'exchange', 'side', 'result'] };
export function recordTrade(tokenId: string, exchange: string, side: 'buy' | 'sell', pnl: number): void { if (!_tradeCounter) _tradeCounter = initCounter(C_TRADE); _tradeCounter.inc({ token_id: tokenId, exchange, side, result: pnl >= 0 ? 'win' : 'loss' }); }

const G_DAILY_PNL: GaugeConfiguration<string> = { name: 'algo_trader_daily_pnl_usd', help: 'Daily P&L in USD', labelNames: [] };
export function setDailyPnlUsd(v: number): void { if (!_dailyPnlGauge) _dailyPnlGauge = initGauge(G_DAILY_PNL); _dailyPnlGauge.set({}, v); }
export const dailyPnlUsd: Gauge<string> = _dailyPnlGauge as Gauge<string>;

const G_WIN_RATE: GaugeConfiguration<string> = { name: 'algo_trader_win_rate_percent', help: 'Win rate percentage', labelNames: [] };
export function setWinRatePercent(v: number): void { if (!_winRateGauge) _winRateGauge = initGauge(G_WIN_RATE); _winRateGauge.set({}, v); }
export const winRatePercent: Gauge<string> = _winRateGauge as Gauge<string>;

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
//  EXTERNAL API LATENCY — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

let _externalApiLatencyHistDesk: Histogram<string> | undefined;
const H_EXT_API: HistogramConfiguration<string> = { name: 'algo_trader_external_api_latency_seconds', help: 'External API call latency in seconds', labelNames: ['service', 'endpoint', 'region'], buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] };
export function recordExternalApiLatency(service: string, endpoint: string, region: string, latencySeconds: number): void { if (!_externalApiLatencyHistDesk) _externalApiLatencyHistDesk = initHistogram(H_EXT_API); _externalApiLatencyHistDesk.observe({ service, endpoint, region }, latencySeconds); }
export const externalApiLatency: Histogram<string> = _externalApiLatencyHistDesk as Histogram<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN KILL SWITCH + DRAWDOWN AUTO-DISABLE — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

const G_QKILL_SWITCH: GaugeConfiguration<string> = { name: 'algo_trader_qwen_kill_switch_active', help: 'fable-5 kill switch state (1=active)', labelNames: [] };
let _qKillSwitchGauge: Gauge<string> | undefined;
export function setQwenKillSwitch(active: boolean): void { if (!_qKillSwitchGauge) _qKillSwitchGauge = initGauge(G_QKILL_SWITCH); _qKillSwitchGauge.set({}, active ? 1 : 0); }

const G_QDRAWDOWN_DIS: GaugeConfiguration<string> = { name: 'algo_trader_qwen_drawdown_auto_disabled', help: 'fable-5 drawdown auto-disable state (1=disabled)', labelNames: [] };
let _qDrawdownDisGauge: Gauge<string> | undefined;
export function setQwenDrawdownAutoDisabled(disabled: boolean): void { if (!_qDrawdownDisGauge) _qDrawdownDisGauge = initGauge(G_QDRAWDOWN_DIS); _qDrawdownDisGauge.set({}, disabled ? 1 : 0); }

//  fable-5 SIGNALS + STRATEGY REVIEWS + ADMIN KILL
// ══════════════════════════════════════════════════════════════════════════════

const C_QSIG: CounterConfiguration<string> = { name: 'algo_trader_qwen_signals_total', help: 'Total fable-5 signals received', labelNames: ['signal_type', 'status'] };
export function recordQwenSignal(signalType: string, status: string): void { if (!_qSigCounter) _qSigCounter = initCounter(C_QSIG); _qSigCounter.inc({ signal_type: signalType, status }); }
export const qwenSignalsTotal: Counter<string> = _qSigCounter as Counter<string>;

const C_QREV: CounterConfiguration<string> = { name: 'algo_trader_qwen_strategy_reviews_resolved_total', help: 'fable-5 strategy reviews resolved', labelNames: ['resolution'] };
export function recordQwenStrategyReview(resolution: string): void { if (!_qReviewCounter) _qReviewCounter = initCounter(C_QREV); _qReviewCounter.inc({ resolution }); }
export const qwenStrategyReviewsResolvedTotal: Counter<string> = _qReviewCounter as Counter<string>;

const C_QKILL: CounterConfiguration<string> = { name: 'algo_trader_qwen_admin_kill_actions_total', help: 'Admin kill actions on fable-5', labelNames: ['action'] };
export function recordQwenAdminKillAction(action: string): void { if (!_qKillCounter) _qKillCounter = initCounter(C_QKILL); _qKillCounter.inc({ action }); }
export const qwenAdminKillActionsTotal: Counter<string> = _qKillCounter as Counter<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN PAPER GATE + SIGNALS LOOP STATE
// ══════════════════════════════════════════════════════════════════════════════

const G_QPAPER_PNL: GaugeConfiguration<string> = { name: 'algo_trader_qwen_paper_pnl_pct', help: 'Rolling 24h paper P&L percentage for Qwen signals', labelNames: [] };
export function setQwenPaperPnlPct(v: number): void { if (!_qPaperPnlGauge) _qPaperPnlGauge = initGauge(G_QPAPER_PNL); _qPaperPnlGauge.set({}, v); }
export const qwenPaperPnlPct: Gauge<string> = _qPaperPnlGauge as Gauge<string>;

const G_QPAPER_GATE: GaugeConfiguration<string> = { name: 'algo_trader_qwen_paper_gate_days_remaining', help: 'Days remaining before Qwen paper gate lifts', labelNames: [] };
export function setQwenPaperGateDaysRemaining(days: number): void { if (!_qPaperGateGauge) _qPaperGateGauge = initGauge(G_QPAPER_GATE); _qPaperGateGauge.set({}, days); }
export const qwenPaperGateDaysRemaining: Gauge<string> = _qPaperGateGauge as Gauge<string>;

const G_QLOOP_TS: GaugeConfiguration<string> = { name: 'algo_trader_qwen_signals_loop_last_run_ts', help: 'Unix timestamp of last signals loop run', labelNames: [] };
export function setQwenSignalsLoopLastRunTs(ts: number): void { if (!_qLoopTsGauge) _qLoopTsGauge = initGauge(G_QLOOP_TS); _qLoopTsGauge.set({}, ts); }
export const qwenSignalsLoopLastRunTs: Gauge<string> = _qLoopTsGauge as Gauge<string>;

const C_QJOURNAL_ERR: CounterConfiguration<string> = { name: 'algo_trader_qwen_signals_loop_journal_write_errors_total', help: 'Journal write errors in fable-5 signals loop', labelNames: [] };
export function recordQwenSignalsLoopJournalWriteError(): void { if (!_qJournalErrCounter) _qJournalErrCounter = initCounter(C_QJOURNAL_ERR); _qJournalErrCounter.inc({}); }
export const qwenSignalsLoopJournalWriteErrorsTotal: Counter<string> = _qJournalErrCounter as Counter<string>;

const G_QBACKLOG: GaugeConfiguration<string> = { name: 'algo_trader_qwen_strategy_review_backlog_size', help: 'Pending strategy review tasks', labelNames: [] };
export function setQwenStrategyReviewBacklogSize(count: number): void { if (!_qBacklogGauge) _qBacklogGauge = initGauge(G_QBACKLOG); _qBacklogGauge.set({}, count); }
export const qwenStrategyReviewBacklogSize: Gauge<string> = _qBacklogGauge as Gauge<string>;

const G_QOLDEST_AGE: GaugeConfiguration<string> = { name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec', help: 'Age of oldest pending strategy review', labelNames: [] };
export function setQwenStrategyReviewOldestPendingAgeSec(ageSec: number): void { if (!_qOldestAgeGauge) _qOldestAgeGauge = initGauge(G_QOLDEST_AGE); _qOldestAgeGauge.set({}, ageSec); }
export const qwenStrategyReviewOldestPendingAgeSec: Gauge<string> = _qOldestAgeGauge as Gauge<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  MEMORY PRESSURE — memory-pressure-handler.ts
// ══════════════════════════════════════════════════════════════════════════════

const G_MEM_RSS: GaugeConfiguration<string> = { name: 'algo_trader_memory_rss_bytes', help: 'Process RSS memory in bytes', labelNames: [] };
export function setMemoryRssBytes(bytes: number): void { if (!_memRssGauge) _memRssGauge = initGauge(G_MEM_RSS); _memRssGauge.set({}, bytes); }

const G_MEM_HEAP: GaugeConfiguration<string> = { name: 'algo_trader_memory_heap_used_bytes', help: 'V8 heap used bytes', labelNames: [] };
export function setMemoryHeapBytes(bytes: number): void { if (!_memHeapGauge) _memHeapGauge = initGauge(G_MEM_HEAP); _memHeapGauge.set({}, bytes); }

export function setMemoryMetrics(rss: number, heap: number): void { setMemoryRssBytes(rss); setMemoryHeapBytes(heap); }

const C_MEM_PRESS: CounterConfiguration<string> = { name: 'algo_trader_memory_pressure_events_total', help: 'Memory pressure events detected', labelNames: ['level'] };
export function recordMemoryPressureEvent(level: string): void { if (!_memPressCounter) _memPressCounter = initCounter(C_MEM_PRESS); _memPressCounter.inc({ level }); }

const C_CACHE_EVICT: CounterConfiguration<string> = { name: 'algo_trader_cache_eviction_total', help: 'Cache eviction events', labelNames: ['cache_name'] };
export function recordCacheEviction(cacheName: string): void { if (!_cacheEvictCounter) _cacheEvictCounter = initCounter(C_CACHE_EVICT); _cacheEvictCounter.inc({ cache_name: cacheName }); }

// ══════════════════════════════════════════════════════════════════════════════
//  COMPRESSION + EXTERNAL API LATENCY + SHARD LATENCY
// ══════════════════════════════════════════════════════════════════════════════

const G_COMP: GaugeConfiguration<string> = { name: 'algo_trader_compression_ratio', help: 'Compression ratio (original / compressed)', labelNames: [] };
export function setCompressionRatio(v: number): void { if (!_compRatioGauge) _compRatioGauge = initGauge(G_COMP); _compRatioGauge.set({}, v); }
export const compressionRatio: Gauge<string> = _compRatioGauge as Gauge<string>;


const H_SHARD: HistogramConfiguration<string> = { name: 'algo_trader_shard_latency_seconds', help: 'Shard execution latency', labelNames: ['shard_id', 'operation'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] };
export function recordShardLatency(shardId: string, operation: string, latSec: number): void { if (!_shardHist) _shardHist = initHistogram(H_SHARD); _shardHist.observe({ shard_id: shardId, operation }, latSec); }


// ══════════════════════════════════════════════════════════════════════════════
//  CANDLE COMPLETENESS + DATA GAPS — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

const G_CANDLE_COMPLETENESS: GaugeConfiguration<string> = { name: 'algo_trader_candle_completeness_ratio', help: 'Candle completeness ratio (0-100)', labelNames: ['symbol'] };
let _candleCompletenessGauge: Gauge<string> | undefined;
export function setCandleCompleteness(symbol: string, _p: string, _tf: string, ratio: number): void { if (!_candleCompletenessGauge) _candleCompletenessGauge = initGauge(G_CANDLE_COMPLETENESS); _candleCompletenessGauge.set({ symbol }, ratio); }

const C_DATA_GAPS: CounterConfiguration<string> = { name: 'algo_trader_data_gaps_total', help: 'Total candle data gaps detected', labelNames: ['symbol', 'provider'] };
let _dataGapsCounter: Counter<string> | undefined;
export function recordDataGapsTotal(symbol: string, provider: string): void { if (!_dataGapsCounter) _dataGapsCounter = initCounter(C_DATA_GAPS); _dataGapsCounter.inc({ symbol, provider }); }

// ══════════════════════════════════════════════════════════════════════════════
//  STRATEGY STATE — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

const G_STRATEGY_ACTIVE: GaugeConfiguration<string> = { name: 'algo_trader_strategy_active', help: 'Whether a strategy is currently active (1=yes, 0=no)', labelNames: ['strategy'] };
let _strategyActiveGauge: Gauge<string> | undefined;
export function setStrategyActive(strategy: string, active: boolean): void { if (!_strategyActiveGauge) _strategyActiveGauge = initGauge(G_STRATEGY_ACTIVE); _strategyActiveGauge.set({ strategy }, active ? 1 : 0); }

// ══════════════════════════════════════════════════════════════════════════════
//  COMPRESSION RATIO — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

const G_COMPRESSION_RATIO: GaugeConfiguration<string> = { name: 'algo_trader_compression_ratio_gauge', help: 'Compression ratio (original/compressed)', labelNames: ['algorithm'] };
let _compressionRatioGaugeDesk: Gauge<string> | undefined;
export function recordCompressionRatio(algorithm: string, originalSize: number, compressedSize: number): void { if (!_compressionRatioGaugeDesk) _compressionRatioGaugeDesk = initGauge(G_COMPRESSION_RATIO); if (compressedSize > 0) { _compressionRatioGaugeDesk.set({ algorithm }, originalSize / compressedSize); } }

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN STRATEGY REVIEWS QUEUED + SIGNALS LOOP RUN — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

let _qStrategyReviewsQueuedCounter: Counter<string> | undefined;
const C_QREV_QUEUED: CounterConfiguration<string> = { name: 'algo_trader_qwen_strategy_reviews_queued_total', help: 'Total fable-5 strategy review tasks queued', labelNames: ['reason'] };
export function recordQwenStrategyReviewsQueued(reason: string): void { if (!_qStrategyReviewsQueuedCounter) _qStrategyReviewsQueuedCounter = initCounter(C_QREV_QUEUED); _qStrategyReviewsQueuedCounter.inc({ reason }); }
export const qwenStrategyReviewsQueuedTotal: Counter<string> = _qStrategyReviewsQueuedCounter as Counter<string>;

let _qSignalsLoopRunsCounter: Counter<string> | undefined;
const C_QLOOP_RUNS: CounterConfiguration<string> = { name: 'algo_trader_qwen_signals_loop_runs_total', help: 'Total fable-5 signals loop executions', labelNames: ['decision'] };
export function recordQwenSignalsLoopRun(decision: string): void { if (!_qSignalsLoopRunsCounter) _qSignalsLoopRunsCounter = initCounter(C_QLOOP_RUNS); _qSignalsLoopRunsCounter.inc({ decision }); }
export const qwenSignalsLoopRunsTotal: Counter<string> = _qSignalsLoopRunsCounter as Counter<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN KILL SWITCH + DRAWDOWN AUTO-DISABLE — desk-specific
// ══════════════════════════════════════════════════════════════════════════════
