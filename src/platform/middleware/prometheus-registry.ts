import client from 'prom-client';
import { logger } from '../../shared/utils/logger';

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
export const register = new client.Registry();
if (typeof process !== 'undefined' && process.versions?.node) {
  try {
    client.collectDefaultMetrics({ register });
  } catch (e) {
    logger.warn('Failed to collect default metrics (expected in Workers):', { error: String(e) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────

// ─── Qwen M1 Max Signal Pipeline Metrics ─────────────────────────────────────
export const qwenPaperPnlPct = new client.Gauge({ name: 'algo_trader_qwen_paper_pnl_pct', help: 'Rolling 24h paper P&L percentage for Qwen M1 Max signals (decimal)', registers: [register] });
export const qwenSignalsTotal = new client.Counter({ name: 'algo_trader_qwen_signals_total', help: 'Total Qwen signals ingested via /api/v1/signals/ingest', labelNames: ['result'] as const, // result: accepted | rejected
  registers: [register] });
export const qwenStrategyReviewsQueuedTotal = new client.Counter({ name: 'algo_trader_qwen_strategy_reviews_queued_total', help: 'Total strategy review tasks queued by qwen-signals-loop', labelNames: ['reason'] as const, registers: [register] });
export const qwenStrategyReviewsResolvedTotal = new client.Counter({ name: 'algo_trader_qwen_strategy_reviews_resolved_total', help: 'Total strategy review tasks resolved via POST /admin/qwen/strategy-reviews/:id/resolve. queued_total - resolved_total = backlog.', labelNames: ['reason'] as const, registers: [register] });
export const qwenStrategyReviewBacklogSize = new client.Gauge({ name: 'algo_trader_qwen_strategy_review_backlog_size', help: 'Count of strategy_review_tasks rows WHERE status=pending. Updated each signals-loop cycle (~6h). Backlog growth indicates sustained quality drift or forgotten operator task.', registers: [register] });
export const qwenStrategyReviewOldestPendingAgeSec = new client.Gauge({ name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec', help: 'Age in seconds of the oldest pending strategy_review_tasks row. 0 when backlog empty. Used by QwenStrategyReviewBacklog alert (> 48h SLA).', registers: [register] });
export const qwenAdminKillActionsTotal = new client.Counter({ name: 'algo_trader_qwen_admin_kill_actions_total', help: 'Total admin actions on Qwen kill switch via /api/v1/admin/qwen/kill|unkill. Audit trail for solo operator — any non-zero rate in steady-state deserves a journal entry.', labelNames: ['action'] as const, registers: [register] });
export const qwenDrawdownPnlQueryErrorsTotal = new client.Counter({ name: 'algo_trader_qwen_drawdown_monitor_pnl_query_errors_total', help: 'Count of computeRollingPnl SELECT failures. Distinguishes DB-connectivity issue (non-zero rate) from "no closed Qwen trades in 24h window" (zero rate + pnlPct=null).', registers: [register] });
export const qwenSignalsLoopRunsTotal = new client.Counter({ name: 'algo_trader_qwen_signals_loop_runs_total', help: 'Total qwen signals loop evaluation runs by decision', labelNames: ['decision'] as const, registers: [register] });
export const qwenSignalsLoopLastRunTs = new client.Gauge({ name: 'algo_trader_qwen_signals_loop_last_run_ts', help: 'Unix-seconds timestamp of the most recent qwen-signals-loop journal write. Used by QwenSignalsLoopStale freshness alert (time() - gauge > 7h).', registers: [register] });
export const qwenSignalsLoopJournalWriteErrorsTotal = new client.Counter({ name: 'algo_trader_qwen_signals_loop_journal_write_errors_total', help: 'Count of persistRunJournal INSERT failures. Complements QwenSignalsLoopStale: non-zero rate here + stale gauge = DB-write failing; zero rate here + stale gauge = timer dead.', registers: [register] });

// ─── L-tier rollback visibility (Pillar 2 observability) ─────────────────────
export const qwenKillSwitchActive = new client.Gauge({ name: 'algo_trader_qwen_kill_switch_active', help: 'L1 kill-switch active state (0|1). Labels: source=env|kv', labelNames: ['source'] as const, registers: [register] });
export const qwenPaperGateDaysRemaining = new client.Gauge({ name: 'algo_trader_qwen_paper_gate_days_remaining', help: 'L4 paper gate: days remaining before Qwen can flip live (0-30, clamped)', registers: [register] });
export const qwenDrawdownAutoDisabled = new client.Gauge({ name: 'algo_trader_qwen_drawdown_auto_disabled', help: 'L3 drawdown auto-disable state (0|1). 1 = swarm disabled by -5% breach', registers: [register] });
export const qwenDrawdownMonitorLastRunTs = new client.Gauge({ name: 'algo_trader_qwen_drawdown_monitor_last_run_ts', help: 'Unix-seconds timestamp of the most recent qwen-drawdown-monitor cycle start. Used by QwenDrawdownMonitorStale freshness alert (time() - gauge > 7h).', registers: [register] });

/**
 * Set L1 kill-switch state for a given source (env flag or KV lookup).
 * source='env' → QWEN_KILL env var; source='kv' → CF KV / admin route.
 */
export function setQwenKillSwitch(source: 'env' | 'kv', active: boolean): void {
  qwenKillSwitchActive.set({ source }, active ? 1 : 0);
}

// ─── Memory Metrics (Task 6 - Memory Optimization) ─────────────────────────────
export const memoryRssBytes = new client.Gauge({ name: 'algo_trader_memory_rss_bytes', help: 'Resident Set Size (RSS) memory usage in bytes. Total memory allocated to the process including all heap, stack, and native allocations.', registers: [register] });
export const memoryHeapBytes = new client.Gauge({ name: 'algo_trader_memory_heap_bytes', help: 'JavaScript heap used memory in bytes. Current active heap allocations.', registers: [register] });
export const memoryUtilizationRatio = new client.Gauge({ name: 'algo_trader_memory_utilization_ratio', help: 'Memory utilization ratio (RSS / limit). 0 = 0%, 1 = 100% of 128MB Cloudflare Worker limit. Thresholds: warning=0.78 (100MB), critical=0.90 (115MB).', registers: [register] });
export const memoryPressureEventsTotal = new client.Counter({ name: 'algo_trader_memory_pressure_events_total', help: 'Total number of memory pressure events triggered by level.', labelNames: ['level'] as const, registers: [register] });
export const cacheEvictionsTotal = new client.Counter({ name: 'algo_trader_cache_evictions_total', help: 'Total number of cache evictions by cache type.', labelNames: ['cache_type'] as const, registers: [register] });
export const compressionRatio = new client.Gauge({ name: 'algo_trader_compression_ratio', help: 'Compression ratio achieved (original_size / compressed_size). Higher is better. Target: >1.5x for JSON data.', registers: [register] });
export const tradesTotal = new client.Counter({ name: 'trades_total', help: 'Total number of trades executed', labelNames: ['symbol', 'exchange', 'side'] as const, registers: [register] });
export const dailyPnlUsd = new client.Gauge({ name: 'daily_pnl_usd', help: 'Daily profit and loss in USD', labelNames: ['strategy'] as const, registers: [register] });
export const winRatePercent = new client.Gauge({ name: 'win_rate_percent', help: 'Win rate percentage (winning trades / total trades)', labelNames: ['strategy'] as const, registers: [register] });
export const circuitBreakerState = new client.Gauge({ name: 'circuit_breaker_state', help: 'Circuit breaker state (0 = active, 1 = halted)', registers: [register] });
export const openPositionsTotal = new client.Gauge({ name: 'open_positions_total', help: 'Total number of open positions', labelNames: ['symbol', 'exchange'] as const, registers: [register] });
export const exchangeApiLatency = new client.Histogram({ name: 'exchange_api_latency_seconds', help: 'Exchange API request latency in seconds', labelNames: ['exchange', 'operation'] as const, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10], registers: [register] });
export const signalsTotal = new client.Counter({ name: 'signals_total', help: 'Total number of trading signals generated', labelNames: ['symbol', 'signal_type'] as const, registers: [register] });
export const strategyActive = new client.Gauge({ name: 'strategy_active', help: 'Whether a trading strategy is active (1 = active, 0 = inactive)', labelNames: ['strategy'] as const, registers: [register] });
export const tradeExecutionTime = new client.Histogram({ name: 'trade_execution_time_seconds', help: 'Time to execute a trade order', labelNames: ['exchange', 'symbol'] as const, buckets: [0.1, 0.5, 1, 2, 5, 10, 30], registers: [register] });

// ─── Market Data Quality Metrics (Gap Detection, Outlier Detection, SLA) ────
export const dataGapsTotal = new client.Counter({ name: 'market_data_gaps_total', help: 'Total number of data gaps detected across all providers/symbols', labelNames: ['provider', 'symbol'] as const, registers: [register] });
export const gapDetectionDuration = new client.Histogram({ name: 'market_data_gap_detection_seconds', help: 'Time spent detecting gaps per cycle', buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [register] });
export const expectedCandles = new client.Gauge({ name: 'market_data_expected_candles', help: 'Expected candle count per symbol/timeframe window', labelNames: ['symbol', 'timeframe'] as const, registers: [register] });
export const receivedCandles = new client.Gauge({ name: 'market_data_received_candles', help: 'Received candle count per symbol/timeframe window', labelNames: ['symbol', 'timeframe'] as const, registers: [register] });
export const candleCompleteness = new client.Gauge({ name: 'market_data_candle_completeness', help: 'Candle completeness ratio (received/expected) per symbol/timeframe', labelNames: ['symbol', 'timeframe'] as const, registers: [register] });
export const outlierEventsTotal = new client.Counter({ name: 'market_data_outlier_events_total', help: 'Total outlier detection events by provider/symbol/field', labelNames: ['provider', 'symbol', 'field'] as const, registers: [register] });
export const outlierZScore = new client.Histogram({ name: 'market_data_outlier_z_score_seconds', help: 'Z-score event detection latency by outlier symbol provider', labelNames: ['provider', 'symbol', 'field'] as const, buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1], registers: [register] });
export const failoverEventsTotal = new client.Counter({ name: 'provider_failover_events_total', help: 'Total provider failover events by provider/direction', labelNames: ['provider', 'direction'] as const, registers: [register] });
export const providerHealthScore = new client.Gauge({ name: 'provider_health_score', help: 'Provider health score (0-100)', labelNames: ['provider'] as const, registers: [register] });
export const providerAvailability = new client.Gauge({ name: 'provider_availability', help: 'Provider availability ratio (0-1)', labelNames: ['provider'] as const, registers: [register] });
export const providerErrorRate = new client.Gauge({ name: 'provider_error_rate', help: 'Provider error rate (0-1)', labelNames: ['provider'] as const, registers: [register] });
export const slaComplianceTotal = new client.Counter({ name: 'sla_compliance_total', help: 'SLA compliance check results by provider/result', labelNames: ['provider', 'result'] as const, registers: [register] });

// ─── Record Functions for Market Data Metrics ─────────────────────────────────

// ─── Latency Monitoring Histograms (Phase 5) ───────────────────────────────────

export const httpRequestDuration = new client.Histogram({ name: 'http_request_duration_seconds', help: 'HTTP request duration in seconds', labelNames: ['method', 'route', 'region', 'status'] as const, buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], registers: [register], });

export const externalApiLatency = new client.Histogram({ name: 'external_api_latency_seconds', help: 'External API call latency in seconds', labelNames: ['service', 'endpoint', 'region'] as const, buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [register], });

export const shardLatency = new client.Histogram({ name: 'shard_latency_seconds', help: 'Durable Object shard operation latency', labelNames: ['shard_id', 'operation'] as const, buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5], registers: [register], });

export const queueWaitTime = new client.Histogram({ name: 'queue_wait_seconds', help: 'Agent queue wait time before processing', labelNames: ['priority', 'agent', 'tier'] as const, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [register], });

