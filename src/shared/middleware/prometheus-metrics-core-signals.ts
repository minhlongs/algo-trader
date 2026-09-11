/**
 * Prometheus Metrics Core — Signals, Memory, Compression, Shard, Strategy
 *
 * Lazy-init metric definitions for: Qwen kill switch/drawdown, signals/reviews/admin,
 * paper gate/loop state, memory pressure, compression, shard latency,
 * candle completeness, strategy state, and desk-specific review queues.
 *
 * Extracted from prometheus-metrics-core.ts to keep files under 200 lines.
 * Re-exported via prometheus-metrics-core.ts facade.
 * Shares the same Registry instance from prometheus-metrics-core-data.ts.
 */

import {
  Counter, Gauge, Histogram,
  CounterConfiguration, GaugeConfiguration, HistogramConfiguration,
} from 'prom-client';
import { register } from './prometheus-metrics-core-data';

function initCounter(c: CounterConfiguration<string>): Counter<string> { return new Counter({ ...c, registers: [register] }); }
function initGauge(c: GaugeConfiguration<string>): Gauge<string> { return new Gauge({ ...c, registers: [register] }); }
function initHistogram(c: HistogramConfiguration<string>): Histogram<string> { return new Histogram({ ...c, registers: [register] }); }

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN KILL SWITCH + DRAWDOWN AUTO-DISABLE
// ══════════════════════════════════════════════════════════════════════════════

const G_QKILL_SWITCH: GaugeConfiguration<string> = { name: 'algo_trader_qwen_kill_switch_active', help: 'fable-5 kill switch state (1=active)', labelNames: [] };
let _qKillSwitchGauge: Gauge<string> | undefined;
export function setQwenKillSwitch(active: boolean): void { if (!_qKillSwitchGauge) _qKillSwitchGauge = initGauge(G_QKILL_SWITCH); _qKillSwitchGauge.set({}, active ? 1 : 0); }

const G_QDRAWDOWN_DIS: GaugeConfiguration<string> = { name: 'algo_trader_qwen_drawdown_auto_disabled', help: 'fable-5 drawdown auto-disable state (1=disabled)', labelNames: [] };
let _qDrawdownDisGauge: Gauge<string> | undefined;
export function setQwenDrawdownAutoDisabled(disabled: boolean): void { if (!_qDrawdownDisGauge) _qDrawdownDisGauge = initGauge(G_QDRAWDOWN_DIS); _qDrawdownDisGauge.set({}, disabled ? 1 : 0); }

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN SIGNALS + STRATEGY REVIEWS + ADMIN KILL
// ══════════════════════════════════════════════════════════════════════════════

let _qSigCounter: Counter<string> | undefined;
const C_QSIG: CounterConfiguration<string> = { name: 'algo_trader_qwen_signals_total', help: 'Total fable-5 signals received', labelNames: ['signal_type', 'status'] };
export function recordQwenSignal(signalType: string, status: string): void { if (!_qSigCounter) _qSigCounter = initCounter(C_QSIG); _qSigCounter.inc({ signal_type: signalType, status }); }
export const qwenSignalsTotal: Counter<string> = _qSigCounter as Counter<string>;

let _qReviewCounter: Counter<string> | undefined;
const C_QREV: CounterConfiguration<string> = { name: 'algo_trader_qwen_strategy_reviews_resolved_total', help: 'fable-5 strategy reviews resolved', labelNames: ['resolution'] };
export function recordQwenStrategyReview(resolution: string): void { if (!_qReviewCounter) _qReviewCounter = initCounter(C_QREV); _qReviewCounter.inc({ resolution }); }
export const qwenStrategyReviewsResolvedTotal: Counter<string> = _qReviewCounter as Counter<string>;

let _qKillCounter: Counter<string> | undefined;
const C_QKILL: CounterConfiguration<string> = { name: 'algo_trader_qwen_admin_kill_actions_total', help: 'Admin kill actions on fable-5', labelNames: ['action'] };
export function recordQwenAdminKillAction(action: string): void { if (!_qKillCounter) _qKillCounter = initCounter(C_QKILL); _qKillCounter.inc({ action }); }
export const qwenAdminKillActionsTotal: Counter<string> = _qKillCounter as Counter<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN PAPER GATE + SIGNALS LOOP STATE
// ══════════════════════════════════════════════════════════════════════════════

let _qPaperPnlGauge: Gauge<string> | undefined;
const G_QPAPER_PNL: GaugeConfiguration<string> = { name: 'algo_trader_qwen_paper_pnl_pct', help: 'Rolling 24h paper P&L percentage for Qwen signals', labelNames: [] };
export function setQwenPaperPnlPct(v: number): void { if (!_qPaperPnlGauge) _qPaperPnlGauge = initGauge(G_QPAPER_PNL); _qPaperPnlGauge.set({}, v); }
export const qwenPaperPnlPct: Gauge<string> = _qPaperPnlGauge as Gauge<string>;

let _qPaperGateGauge: Gauge<string> | undefined;
const G_QPAPER_GATE: GaugeConfiguration<string> = { name: 'algo_trader_qwen_paper_gate_days_remaining', help: 'Days remaining before Qwen paper gate lifts', labelNames: [] };
export function setQwenPaperGateDaysRemaining(days: number): void { if (!_qPaperGateGauge) _qPaperGateGauge = initGauge(G_QPAPER_GATE); _qPaperGateGauge.set({}, days); }
export const qwenPaperGateDaysRemaining: Gauge<string> = _qPaperGateGauge as Gauge<string>;

let _qLoopTsGauge: Gauge<string> | undefined;
const G_QLOOP_TS: GaugeConfiguration<string> = { name: 'algo_trader_qwen_signals_loop_last_run_ts', help: 'Unix timestamp of last signals loop run', labelNames: [] };
export function setQwenSignalsLoopLastRunTs(ts: number): void { if (!_qLoopTsGauge) _qLoopTsGauge = initGauge(G_QLOOP_TS); _qLoopTsGauge.set({}, ts); }
export const qwenSignalsLoopLastRunTs: Gauge<string> = _qLoopTsGauge as Gauge<string>;

let _qJournalErrCounter: Counter<string> | undefined;
const C_QJOURNAL_ERR: CounterConfiguration<string> = { name: 'algo_trader_qwen_signals_loop_journal_write_errors_total', help: 'Journal write errors in fable-5 signals loop', labelNames: [] };
export function recordQwenSignalsLoopJournalWriteError(): void { if (!_qJournalErrCounter) _qJournalErrCounter = initCounter(C_QJOURNAL_ERR); _qJournalErrCounter.inc({}); }
export const qwenSignalsLoopJournalWriteErrorsTotal: Counter<string> = _qJournalErrCounter as Counter<string>;

let _qBacklogGauge: Gauge<string> | undefined;
const G_QBACKLOG: GaugeConfiguration<string> = { name: 'algo_trader_qwen_strategy_review_backlog_size', help: 'Pending strategy review tasks', labelNames: [] };
export function setQwenStrategyReviewBacklogSize(count: number): void { if (!_qBacklogGauge) _qBacklogGauge = initGauge(G_QBACKLOG); _qBacklogGauge.set({}, count); }
export const qwenStrategyReviewBacklogSize: Gauge<string> = _qBacklogGauge as Gauge<string>;

let _qOldestAgeGauge: Gauge<string> | undefined;
const G_QOLDEST_AGE: GaugeConfiguration<string> = { name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec', help: 'Age of oldest pending strategy review', labelNames: [] };
export function setQwenStrategyReviewOldestPendingAgeSec(ageSec: number): void { if (!_qOldestAgeGauge) _qOldestAgeGauge = initGauge(G_QOLDEST_AGE); _qOldestAgeGauge.set({}, ageSec); }
export const qwenStrategyReviewOldestPendingAgeSec: Gauge<string> = _qOldestAgeGauge as Gauge<string>;

// ══════════════════════════════════════════════════════════════════════════════
//  MEMORY PRESSURE — memory-pressure-handler.ts
// ══════════════════════════════════════════════════════════════════════════════

let _memRssGauge: Gauge<string> | undefined;
const G_MEM_RSS: GaugeConfiguration<string> = { name: 'algo_trader_memory_rss_bytes', help: 'Process RSS memory in bytes', labelNames: [] };
export function setMemoryRssBytes(bytes: number): void { if (!_memRssGauge) _memRssGauge = initGauge(G_MEM_RSS); _memRssGauge.set({}, bytes); }

let _memHeapGauge: Gauge<string> | undefined;
const G_MEM_HEAP: GaugeConfiguration<string> = { name: 'algo_trader_memory_heap_used_bytes', help: 'V8 heap used bytes', labelNames: [] };
export function setMemoryHeapBytes(bytes: number): void { if (!_memHeapGauge) _memHeapGauge = initGauge(G_MEM_HEAP); _memHeapGauge.set({}, bytes); }

export function setMemoryMetrics(rss: number, heap: number): void { setMemoryRssBytes(rss); setMemoryHeapBytes(heap); }

let _memPressCounter: Counter<string> | undefined;
const C_MEM_PRESS: CounterConfiguration<string> = { name: 'algo_trader_memory_pressure_events_total', help: 'Memory pressure events detected', labelNames: ['level'] };
export function recordMemoryPressureEvent(level: string): void { if (!_memPressCounter) _memPressCounter = initCounter(C_MEM_PRESS); _memPressCounter.inc({ level }); }

let _cacheEvictCounter: Counter<string> | undefined;
const C_CACHE_EVICT: CounterConfiguration<string> = { name: 'algo_trader_cache_eviction_total', help: 'Cache eviction events', labelNames: ['cache_name'] };
export function recordCacheEviction(cacheName: string): void { if (!_cacheEvictCounter) _cacheEvictCounter = initCounter(C_CACHE_EVICT); _cacheEvictCounter.inc({ cache_name: cacheName }); }

// ══════════════════════════════════════════════════════════════════════════════
//  COMPRESSION + SHARD LATENCY
// ══════════════════════════════════════════════════════════════════════════════

let _compRatioGauge: Gauge<string> | undefined;
const G_COMP: GaugeConfiguration<string> = { name: 'algo_trader_compression_ratio', help: 'Compression ratio (original / compressed)', labelNames: [] };
export function setCompressionRatio(v: number): void { if (!_compRatioGauge) _compRatioGauge = initGauge(G_COMP); _compRatioGauge.set({}, v); }
export const compressionRatio: Gauge<string> = _compRatioGauge as Gauge<string>;

let _shardHist: Histogram<string> | undefined;
const H_SHARD: HistogramConfiguration<string> = { name: 'algo_trader_shard_latency_seconds', help: 'Shard execution latency', labelNames: ['shard_id', 'operation'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] };
export function recordShardLatency(shardId: string, operation: string, latSec: number): void { if (!_shardHist) _shardHist = initHistogram(H_SHARD); _shardHist.observe({ shard_id: shardId, operation }, latSec); }

// ══════════════════════════════════════════════════════════════════════════════
//  CANDLE COMPLETENESS + DATA GAPS — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

let _candleCompletenessGauge: Gauge<string> | undefined;
const G_CANDLE_COMPLETENESS: GaugeConfiguration<string> = { name: 'algo_trader_candle_completeness_ratio', help: 'Candle completeness ratio (0-100)', labelNames: ['symbol'] };
export function setCandleCompleteness(symbol: string, _p: string, _tf: string, ratio: number): void { if (!_candleCompletenessGauge) _candleCompletenessGauge = initGauge(G_CANDLE_COMPLETENESS); _candleCompletenessGauge.set({ symbol }, ratio); }

let _dataGapsCounter: Counter<string> | undefined;
const C_DATA_GAPS: CounterConfiguration<string> = { name: 'algo_trader_data_gaps_total', help: 'Total candle data gaps detected', labelNames: ['symbol', 'provider'] };
export function recordDataGapsTotal(symbol: string, provider: string): void { if (!_dataGapsCounter) _dataGapsCounter = initCounter(C_DATA_GAPS); _dataGapsCounter.inc({ symbol, provider }); }

// ══════════════════════════════════════════════════════════════════════════════
//  STRATEGY STATE — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

let _strategyActiveGauge: Gauge<string> | undefined;
const G_STRATEGY_ACTIVE: GaugeConfiguration<string> = { name: 'algo_trader_strategy_active', help: 'Whether a strategy is currently active (1=yes, 0=no)', labelNames: ['strategy'] };
export function setStrategyActive(strategy: string, active: boolean): void { if (!_strategyActiveGauge) _strategyActiveGauge = initGauge(G_STRATEGY_ACTIVE); _strategyActiveGauge.set({ strategy }, active ? 1 : 0); }

// ══════════════════════════════════════════════════════════════════════════════
//  COMPRESSION RATIO — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

let _compressionRatioGaugeDesk: Gauge<string> | undefined;
const G_COMPRESSION_RATIO: GaugeConfiguration<string> = { name: 'algo_trader_compression_ratio_gauge', help: 'Compression ratio (original/compressed)', labelNames: ['algorithm'] };
export function recordCompressionRatio(algorithm: string, originalSize: number, compressedSize: number): void { if (!_compressionRatioGaugeDesk) _compressionRatioGaugeDesk = initGauge(G_COMPRESSION_RATIO); if (compressedSize > 0) { _compressionRatioGaugeDesk.set({ algorithm }, originalSize / compressedSize); } }

// ══════════════════════════════════════════════════════════════════════════════
//  QWEN STRATEGY REVIEWS QUEUED + SIGNALS LOOP RUNS — desk-specific
// ══════════════════════════════════════════════════════════════════════════════

let _qStrategyReviewsQueuedCounter: Counter<string> | undefined;
const C_QREV_QUEUED: CounterConfiguration<string> = { name: 'algo_trader_qwen_strategy_reviews_queued_total', help: 'Total fable-5 strategy review tasks queued', labelNames: ['reason'] };
export function recordQwenStrategyReviewsQueued(reason: string): void { if (!_qStrategyReviewsQueuedCounter) _qStrategyReviewsQueuedCounter = initCounter(C_QREV_QUEUED); _qStrategyReviewsQueuedCounter.inc({ reason }); }
export const qwenStrategyReviewsQueuedTotal: Counter<string> = _qStrategyReviewsQueuedCounter as Counter<string>;

let _qSignalsLoopRunsCounter: Counter<string> | undefined;
const C_QLOOP_RUNS: CounterConfiguration<string> = { name: 'algo_trader_qwen_signals_loop_runs_total', help: 'Total fable-5 signals loop executions', labelNames: ['decision'] };
export function recordQwenSignalsLoopRun(decision: string): void { if (!_qSignalsLoopRunsCounter) _qSignalsLoopRunsCounter = initCounter(C_QLOOP_RUNS); _qSignalsLoopRunsCounter.inc({ decision }); }
export const qwenSignalsLoopRunsTotal: Counter<string> = _qSignalsLoopRunsCounter as Counter<string>;
