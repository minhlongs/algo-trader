/**
 * Prometheus Metrics Definitions
 *
 * All Prometheus metric registrations (Gauges, Counters, Histograms) + registry.
 * Separated from middleware/route handlers to keep files under 200 lines.
 */
import client from 'prom-client';

// ── Registry ──────────────────────────────────────────────────────────────────

export const register = new client.Registry();

// Enable default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// ═══════════════════════════════════════════════════════════════════════════════
// Qwen M1 Max Signal Pipeline Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/** Gauge: rolling 24h paper P&L percentage for Qwen signals (decimal, e.g. -0.06 = -6%) */
export const qwenPaperPnlPct = new client.Gauge({
  name: 'algo_trader_qwen_paper_pnl_pct',
  help: 'Rolling 24h paper P&L percentage for Qwen M1 Max signals (decimal)',
  registers: [register],
});

/** Counter: Qwen signals processed by the ingest route */
export const qwenSignalsTotal = new client.Counter({
  name: 'algo_trader_qwen_signals_total',
  help: 'Total Qwen signals ingested via /api/v1/signals/ingest',
  labelNames: ['result'] as const, // result: accepted | rejected
  registers: [register],
});

/** Counter: strategy review tasks queued by signals loop (labeled by trigger reason) */
export const qwenStrategyReviewsQueuedTotal = new client.Counter({
  name: 'algo_trader_qwen_strategy_reviews_queued_total',
  help: 'Total strategy review tasks queued by qwen-signals-loop',
  labelNames: ['reason'] as const,
  registers: [register],
});

/** Counter: strategy review tasks resolved via admin API */
export const qwenStrategyReviewsResolvedTotal = new client.Counter({
  name: 'algo_trader_qwen_strategy_reviews_resolved_total',
  help: 'Total strategy review tasks resolved via POST /admin/qwen/strategy-reviews/:id/resolve',
  labelNames: ['reason'] as const,
  registers: [register],
});

/** Gauge: current count of pending strategy review tasks */
export const qwenStrategyReviewBacklogSize = new client.Gauge({
  name: 'algo_trader_qwen_strategy_review_backlog_size',
  help: 'Count of strategy_review_tasks rows WHERE status=pending (excludes resolved/acknowledged). Updated each signals-loop cycle (~6h).',
  registers: [register],
});

/** Gauge: age in seconds of oldest pending strategy review */
export const qwenStrategyReviewOldestPendingAgeSec = new client.Gauge({
  name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec',
  help: 'Age in seconds of the oldest pending strategy_review_tasks row. 0 when backlog empty.',
  registers: [register],
});

/** Counter: admin kill-switch actions (audit trail for solo operator) */
export const qwenAdminKillActionsTotal = new client.Counter({
  name: 'algo_trader_qwen_admin_kill_actions_total',
  help: 'Total admin actions on Qwen kill switch via /api/v1/admin/qwen/kill|unkill.',
  labelNames: ['action'] as const,
  registers: [register],
});

/** Counter: drawdown-monitor DB-query failures */
export const qwenDrawdownPnlQueryErrorsTotal = new client.Counter({
  name: 'algo_trader_qwen_drawdown_monitor_pnl_query_errors_total',
  help: 'Count of computeRollingPnl SELECT failures.',
  registers: [register],
});

/** Counter: signals loop evaluation runs by decision outcome */
export const qwenSignalsLoopRunsTotal = new client.Counter({
  name: 'algo_trader_qwen_signals_loop_runs_total',
  help: 'Total qwen signals loop evaluation runs by decision',
  labelNames: ['decision'] as const,
  registers: [register],
});

/** Gauge: unix-seconds of last signals-loop journal write (liveness probe) */
export const qwenSignalsLoopLastRunTs = new client.Gauge({
  name: 'algo_trader_qwen_signals_loop_last_run_ts',
  help: 'Unix-seconds timestamp of the most recent qwen-signals-loop journal write.',
  registers: [register],
});

/** Counter: signals-loop journal INSERT failures */
export const qwenSignalsLoopJournalWriteErrorsTotal = new client.Counter({
  name: 'algo_trader_qwen_signals_loop_journal_write_errors_total',
  help: 'Count of persistRunJournal INSERT failures.',
  registers: [register],
});

/** Counter: DNA journal write failures classified by error type */
export const journalWriteErrorsTotal = new client.Counter({
  name: 'journal_write_errors_total',
  help: 'Total DNA journal write failures. Label error_type=db_error|timeout|unknown.',
  labelNames: ['error_type'] as const,
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// L-Tier Rollback Visibility (Pillar 2 observability)
// ═══════════════════════════════════════════════════════════════════════════════

/** Gauge: kill-switch active state (0=inactive, 1=active), labeled by source */
export const qwenKillSwitchActive = new client.Gauge({
  name: 'algo_trader_qwen_kill_switch_active',
  help: 'L1 kill-switch active state (0|1). Labels: source=env|kv',
  labelNames: ['source'] as const,
  registers: [register],
});

/** Gauge: days remaining in MIN_PAPER_DAYS=30 validation window (L4) */
export const qwenPaperGateDaysRemaining = new client.Gauge({
  name: 'algo_trader_qwen_paper_gate_days_remaining',
  help: 'L4 paper gate: days remaining before Qwen can flip live (0-30, clamped)',
  registers: [register],
});

/** Gauge: L3 drawdown auto-disable state (0=enabled, 1=disabled by breach) */
export const qwenDrawdownAutoDisabled = new client.Gauge({
  name: 'algo_trader_qwen_drawdown_auto_disabled',
  help: 'L3 drawdown auto-disable state (0|1). 1 = swarm disabled by -5%% breach',
  registers: [register],
});

/** Gauge: unix-seconds of last drawdown-monitor cycle invocation (liveness probe) */
export const qwenDrawdownMonitorLastRunTs = new client.Gauge({
  name: 'algo_trader_qwen_drawdown_monitor_last_run_ts',
  help: 'Unix-seconds timestamp of the most recent qwen-drawdown-monitor cycle start.',
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// Core Trading Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/** Counter: total trades executed */
export const tradesTotal = new client.Counter({
  name: 'trades_total',
  help: 'Total number of trades executed',
  labelNames: ['symbol', 'exchange', 'side'] as const,
  registers: [register],
});

/** Gauge: daily P&L in USD */
export const dailyPnlUsd = new client.Gauge({
  name: 'daily_pnl_usd',
  help: 'Daily profit and loss in USD',
  labelNames: ['strategy'] as const,
  registers: [register],
});

/** Gauge: win rate percentage */
export const winRatePercent = new client.Gauge({
  name: 'win_rate_percent',
  help: 'Win rate percentage (winning trades / total trades)',
  labelNames: ['strategy'] as const,
  registers: [register],
});

/** Gauge: circuit breaker state (0 = active, 1 = halted) */
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0 = active, 1 = halted)',
  registers: [register],
});

/** Gauge: number of open positions */
export const openPositionsTotal = new client.Gauge({
  name: 'open_positions_total',
  help: 'Total number of open positions',
  labelNames: ['symbol', 'exchange'] as const,
  registers: [register],
});

/** Histogram: exchange API request latency in seconds */
export const exchangeApiLatency = new client.Histogram({
  name: 'exchange_api_latency_seconds',
  help: 'Exchange API request latency in seconds',
  labelNames: ['exchange', 'operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/** Counter: total trading signals generated */
export const signalsTotal = new client.Counter({
  name: 'signals_total',
  help: 'Total number of trading signals generated',
  labelNames: ['symbol', 'signal_type'] as const,
  registers: [register],
});

/** Gauge: strategy active state (1 = active, 0 = inactive) */
export const strategyActive = new client.Gauge({
  name: 'strategy_active',
  help: 'Whether a trading strategy is active (1 = active, 0 = inactive)',
  labelNames: ['strategy'] as const,
  registers: [register],
});

/** Histogram: trade execution time in seconds */
export const tradeExecutionTime = new client.Histogram({
  name: 'trade_execution_time_seconds',
  help: 'Time to execute a trade order',
  labelNames: ['exchange', 'symbol'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP Request Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/** Counter: total HTTP requests */
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

/** Histogram: HTTP request duration in seconds */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// Market Data Metrics
// ═══════════════════════════════════════════════════════════════════════════════

export const dataGapEvents = new client.Counter({
  name: 'market_data_gap_events_total', help: 'Total data gap events',
  labelNames: ['exchange', 'symbol'] as const, registers: [register],
});
export const dataGapDuration = new client.Histogram({
  name: 'market_data_gap_duration_seconds', help: 'Data gap duration in seconds',
  buckets: [0.5, 1, 5, 15, 30], registers: [register],
});
export const gapDetectionDuration = new client.Histogram({
  name: 'market_data_gap_detection_seconds', help: 'Gap detection processing time in seconds',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1], registers: [register],
});
export const expectedCandles = new client.Gauge({
  name: 'market_data_expected_candles', help: 'Expected candle count', registers: [register],
});
export const receivedCandles = new client.Gauge({
  name: 'market_data_received_candles', help: 'Received candle count', registers: [register],
});
export const candleCompleteness = new client.Gauge({
  name: 'market_data_candle_completeness', help: 'Candle completeness ratio (0-1)', registers: [register],
});
export const outlierEvents = new client.Counter({
  name: 'market_data_outlier_events_total', help: 'Total outlier events',
  labelNames: ['symbol', 'type', 'severity'] as const, registers: [register],
});
export const outlierZScore = new client.Gauge({
  name: 'market_data_outlier_zscore', help: 'Latest outlier Z-score per symbol',
  labelNames: ['symbol'] as const, registers: [register],
});
export const providerLatency = new client.Histogram({
  name: 'market_data_provider_latency_seconds', help: 'Provider API latency in seconds',
  labelNames: ['exchange', 'operation'] as const, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5], registers: [register],
});
export const failoverEvents = new client.Counter({
  name: 'market_data_failover_events_total', help: 'Total failover events',
  labelNames: ['from', 'to', 'reason'] as const, registers: [register],
});
export const circuitBreakerStateProvider = new client.Gauge({
  name: 'market_data_circuit_breaker_state', help: 'Circuit breaker state per provider',
  labelNames: ['exchange', 'state'], registers: [register],
});
export const providerHealthScore = new client.Gauge({
  name: 'market_data_provider_health_score', help: 'Provider health score (0-100)',
  labelNames: ['exchange'] as const, registers: [register],
});
export const providerAvailability = new client.Gauge({
  name: 'market_data_provider_availability', help: 'Provider availability (0 or 1)',
  labelNames: ['exchange'] as const, registers: [register],
});
export const providerErrorRate = new client.Gauge({
  name: 'market_data_provider_error_rate', help: 'Provider error rate (0-1)',
  labelNames: ['exchange'] as const, registers: [register],
});
export const slaCompliance = new client.Counter({
  name: 'market_data_sla_compliance_total', help: 'SLA compliance events',
  labelNames: ['exchange', 'compliant'] as const, registers: [register],
});
