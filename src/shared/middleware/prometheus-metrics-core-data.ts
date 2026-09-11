/**
 * Prometheus Metrics Core — Data Quality, Failover, Queue, API, Trade
 *
 * Lazy-init metric definitions for: candle data gaps, failover/circuit-breaker,
 * SLA compliance, queue/jobs, API request tracking, and trade recording.
 *
 * Extracted from prometheus-metrics-core.ts to keep files under 200 lines.
 * Re-exported via prometheus-metrics-core.ts facade.
 */

import {
  Registry, Counter, Gauge, Histogram,
  CounterConfiguration, GaugeConfiguration, HistogramConfiguration,
} from 'prom-client';

export const register = new Registry();

function initCounter(c: CounterConfiguration<string>): Counter<string> { return new Counter({ ...c, registers: [register] }); }
function initGauge(c: GaugeConfiguration<string>): Gauge<string> { return new Gauge({ ...c, registers: [register] }); }
function initHistogram(c: HistogramConfiguration<string>): Histogram<string> { return new Histogram({ ...c, registers: [register] }); }

// ══════════════════════════════════════════════════════════════════════════════
//  CANDLE DATA — gap-detector.ts
// ══════════════════════════════════════════════════════════════════════════════

let _gapCounter: Counter<string> | undefined;
const C_GAP: CounterConfiguration<string> = { name: 'algo_trader_gap_detections_total', help: 'Total gap detection events', labelNames: ['provider', 'symbol', 'gap_type'] };
export function recordDataGap(provider: string, symbol: string, _d: number): void { if (!_gapCounter) _gapCounter = initCounter(C_GAP); _gapCounter.inc({ provider, symbol, gap_type: 'missing_candle' }); }

let _gapDurHist: Histogram<string> | undefined;
const H_GAP_DUR: HistogramConfiguration<string> = { name: 'algo_trader_gap_detection_duration_seconds', help: 'Gap detection duration', labelNames: ['provider', 'symbol'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1] };
export function recordGapDetectionDuration(provider: string, symbol: string, dur: number): void { if (!_gapDurHist) _gapDurHist = initHistogram(H_GAP_DUR); _gapDurHist.observe({ provider, symbol }, dur); }

let _expectedGauge: Gauge<string> | undefined;
const G_EXPECTED: GaugeConfiguration<string> = { name: 'algo_trader_expected_candles', help: 'Expected candle count', labelNames: ['symbol', 'timeframe'] };
export function setExpectedCandles(_p: string, symbol: string, tf: string, count: number): void { if (!_expectedGauge) _expectedGauge = initGauge(G_EXPECTED); _expectedGauge.set({ symbol, timeframe: tf }, count); }

let _receivedGauge: Gauge<string> | undefined;
const G_RECEIVED: GaugeConfiguration<string> = { name: 'algo_trader_received_candles', help: 'Received candle count', labelNames: ['symbol', 'timeframe'] };
export function setReceivedCandles(_p: string, symbol: string, tf: string, count: number): void { if (!_receivedGauge) _receivedGauge = initGauge(G_RECEIVED); _receivedGauge.set({ symbol, timeframe: tf }, count); }

let _outlierCounter: Counter<string> | undefined;
const C_OUTLIER: CounterConfiguration<string> = { name: 'algo_trader_outlier_events_total', help: 'Outlier events detected', labelNames: ['symbol', 'outlier_type'] };
export function recordOutlierEvent(symbol: string, outlierType: string, _sev: string): void { if (!_outlierCounter) _outlierCounter = initCounter(C_OUTLIER); _outlierCounter.inc({ symbol, outlier_type: outlierType }); }

let _outlierZGauge: Gauge<string> | undefined;
const G_OUTLIER_Z: GaugeConfiguration<string> = { name: 'algo_trader_outlier_zscore', help: 'Latest outlier z-score', labelNames: ['symbol'] };
export function recordOutlierZScore(symbol: string, _t: string, z: number): void { if (!_outlierZGauge) _outlierZGauge = initGauge(G_OUTLIER_Z); _outlierZGauge.set({ symbol }, z); }

// ══════════════════════════════════════════════════════════════════════════════
//  FAILOVER + CIRCUIT BREAKER + SLA + ERROR RATE
// ══════════════════════════════════════════════════════════════════════════════

let _failoverCounter: Counter<string> | undefined;
const C_FAILOVER: CounterConfiguration<string> = { name: 'algo_trader_failover_events_total', help: 'Total provider failover events', labelNames: ['from_provider', 'to_provider', 'reason'] };
export function recordFailoverEvent(from: string, to: string, reason: string): void { if (!_failoverCounter) _failoverCounter = initCounter(C_FAILOVER); _failoverCounter.inc({ from_provider: from, to_provider: to, reason }); }

let _cbGauge: Gauge<string> | undefined;
const G_CB: GaugeConfiguration<string> = { name: 'algo_trader_circuit_breaker_open', help: 'Circuit breaker state (1=open)', labelNames: ['provider'] };
export function setCircuitBreakerState(provider: string, isOpen: boolean): void { if (!_cbGauge) _cbGauge = initGauge(G_CB); _cbGauge.set({ provider }, isOpen ? 1 : 0); }
export const setCircuitBreakerStateProvider = setCircuitBreakerState;

let _slaCounter: Counter<string> | undefined;
const C_SLA: CounterConfiguration<string> = { name: 'algo_trader_sla_compliance_total', help: 'SLA compliance checks', labelNames: ['provider', 'sla_tier', 'compliant'] };
export function recordSlaCompliance(provider: string, tier: string, ok: boolean): void { if (!_slaCounter) _slaCounter = initCounter(C_SLA); _slaCounter.inc({ provider, sla_tier: tier, compliant: String(ok) }); }

let _healthGauge: Gauge<string> | undefined;
const G_HEALTH: GaugeConfiguration<string> = { name: 'algo_trader_provider_health_score', help: 'Provider health score (0-1)', labelNames: ['provider'] };
export function setProviderHealthScore(provider: string, _w: number, score: number): void { if (!_healthGauge) _healthGauge = initGauge(G_HEALTH); _healthGauge.set({ provider }, score); }

let _availGauge: Gauge<string> | undefined;
const G_AVAIL: GaugeConfiguration<string> = { name: 'algo_trader_provider_availability', help: 'Provider availability (0-1)', labelNames: ['provider'] };
export function setProviderAvailability(provider: string, _w: number, available: boolean): void { if (!_availGauge) _availGauge = initGauge(G_AVAIL); _availGauge.set({ provider }, available ? 1 : 0); }

let _errorRateGauge: Gauge<string> | undefined;
const G_ERR_RATE: GaugeConfiguration<string> = { name: 'algo_trader_provider_error_rate', help: 'Provider error rate (0-1)', labelNames: ['provider'] };
export function setProviderErrorRate(provider: string, _w: number, rate: number): void { if (!_errorRateGauge) _errorRateGauge = initGauge(G_ERR_RATE); _errorRateGauge.set({ provider }, rate); }

// ══════════════════════════════════════════════════════════════════════════════
//  QUEUE + JOBS — BullMQ
// ══════════════════════════════════════════════════════════════════════════════

let _queueWaitHist: Histogram<string> | undefined;
const H_QUEUE: HistogramConfiguration<string> = { name: 'algo_trader_queue_wait_seconds', help: 'Queue wait time', labelNames: ['queue', 'priority'], buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300] };
export function recordQueueWaitTime(queue: string, priority: string, waitSec: number): void { if (!_queueWaitHist) _queueWaitHist = initHistogram(H_QUEUE); _queueWaitHist.observe({ queue, priority }, waitSec); }

let _jobsActiveGauge: Gauge<string> | undefined;
const G_JOBS_ACTIVE: GaugeConfiguration<string> = { name: 'algo_trader_jobs_active', help: 'Active BullMQ jobs', labelNames: ['queue', 'priority'] };
export function setJobsActive(queue: string, priority: string, count: number): void { if (!_jobsActiveGauge) _jobsActiveGauge = initGauge(G_JOBS_ACTIVE); _jobsActiveGauge.set({ queue, priority }, count); }

let _jobsDoneCounter: Counter<string> | undefined;
const C_JOBS_DONE: CounterConfiguration<string> = { name: 'algo_trader_jobs_completed_total', help: 'Completed BullMQ jobs', labelNames: ['queue', 'status'] };
export function recordJobCompleted(queue: string, status: string): void { if (!_jobsDoneCounter) _jobsDoneCounter = initCounter(C_JOBS_DONE); _jobsDoneCounter.inc({ queue, status }); }

// ══════════════════════════════════════════════════════════════════════════════
//  API REQUEST TRACKING
// ══════════════════════════════════════════════════════════════════════════════

let _apiReqCounter: Counter<string> | undefined;
const C_API_REQ: CounterConfiguration<string> = { name: 'algo_trader_api_requests_total', help: 'Total API requests', labelNames: ['method', 'path', 'status'] };
export function recordApiRequest(method: string, path: string, status: string): void { if (!_apiReqCounter) _apiReqCounter = initCounter(C_API_REQ); _apiReqCounter.inc({ method, path, status }); }

let _apiErrCounter: Counter<string> | undefined;
const C_API_ERR: CounterConfiguration<string> = { name: 'algo_trader_api_errors_total', help: 'Total API errors', labelNames: ['method', 'path'] };
export function recordApiError(method: string, path: string): void { if (!_apiErrCounter) _apiErrCounter = initCounter(C_API_ERR); _apiErrCounter.inc({ method, path }); }

let _apiDurHist: Histogram<string> | undefined;
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

let _tradeCounter: Counter<string> | undefined;
const C_TRADE: CounterConfiguration<string> = { name: 'algo_trader_trades_total', help: 'Total trades executed', labelNames: ['token_id', 'exchange', 'side', 'result'] };
export function recordTrade(tokenId: string, exchange: string, side: 'buy' | 'sell', pnl: number): void { if (!_tradeCounter) _tradeCounter = initCounter(C_TRADE); _tradeCounter.inc({ token_id: tokenId, exchange, side, result: pnl >= 0 ? 'win' : 'loss' }); }

let _dailyPnlGauge: Gauge<string> | undefined;
const G_DAILY_PNL: GaugeConfiguration<string> = { name: 'algo_trader_daily_pnl_usd', help: 'Daily P&L in USD', labelNames: [] };
export function setDailyPnlUsd(v: number): void { if (!_dailyPnlGauge) _dailyPnlGauge = initGauge(G_DAILY_PNL); _dailyPnlGauge.set({}, v); }
export const dailyPnlUsd: Gauge<string> = _dailyPnlGauge as Gauge<string>;

let _winRateGauge: Gauge<string> | undefined;
const G_WIN_RATE: GaugeConfiguration<string> = { name: 'algo_trader_win_rate_percent', help: 'Win rate percentage', labelNames: [] };
export function setWinRatePercent(v: number): void { if (!_winRateGauge) _winRateGauge = initGauge(G_WIN_RATE); _winRateGauge.set({}, v); }
export const winRatePercent: Gauge<string> = _winRateGauge as Gauge<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  EXTERNAL API LATENCY
// ══════════════════════════════════════════════════════════════════════════════

let _externalApiLatencyHistDesk: Histogram<string> | undefined;
const H_EXT_API: HistogramConfiguration<string> = { name: 'algo_trader_external_api_latency_seconds', help: 'External API call latency in seconds', labelNames: ['service', 'endpoint', 'region'], buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] };
export function recordExternalApiLatency(service: string, endpoint: string, region: string, latencySeconds: number): void { if (!_externalApiLatencyHistDesk) _externalApiLatencyHistDesk = initHistogram(H_EXT_API); _externalApiLatencyHistDesk.observe({ service, endpoint, region }, latencySeconds); }
export const externalApiLatency: Histogram<string> = _externalApiLatencyHistDesk as Histogram<string>;
