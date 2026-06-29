/**
 * Prometheus Metrics Middleware
 * Exposes Prometheus-format metrics for monitoring and alerting
 */

import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Create Registry
// ─────────────────────────────────────────────────────────────────────────────
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// ─────────────────────────────────────────────────────────────────────────────
// Custom Metrics - Trading Specific
// ─────────────────────────────────────────────────────────────────────────────

// ─── Qwen M1 Max Signal Pipeline Metrics ─────────────────────────────────────

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

/** Counter: strategy review tasks resolved via admin API (symmetric to queued counter) */
export const qwenStrategyReviewsResolvedTotal = new client.Counter({
  name: 'algo_trader_qwen_strategy_reviews_resolved_total',
  help: 'Total strategy review tasks resolved via POST /admin/qwen/strategy-reviews/:id/resolve. queued_total - resolved_total = backlog.',
  labelNames: ['reason'] as const,
  registers: [register],
});

/** Gauge: current count of pending strategy review tasks (snapshot from signals-loop) */
export const qwenStrategyReviewBacklogSize = new client.Gauge({
  name: 'algo_trader_qwen_strategy_review_backlog_size',
  help: 'Count of strategy_review_tasks rows WHERE status=pending. Updated each signals-loop cycle (~6h). Backlog growth indicates sustained quality drift or forgotten operator task.',
  registers: [register],
});

/** Gauge: age in seconds of oldest pending strategy review (unix-seconds delta) */
export const qwenStrategyReviewOldestPendingAgeSec = new client.Gauge({
  name: 'algo_trader_qwen_strategy_review_oldest_pending_age_sec',
  help: 'Age in seconds of the oldest pending strategy_review_tasks row. 0 when backlog empty. Used by QwenStrategyReviewBacklog alert (> 48h SLA).',
  registers: [register],
});

/** Counter: admin kill-switch actions (audit trail for solo operator) */
export const qwenAdminKillActionsTotal = new client.Counter({
  name: 'algo_trader_qwen_admin_kill_actions_total',
  help: 'Total admin actions on Qwen kill switch via /api/v1/admin/qwen/kill|unkill. Audit trail for solo operator — any non-zero rate in steady-state deserves a journal entry.',
  labelNames: ['action'] as const,
  registers: [register],
});

/** Counter: drawdown-monitor DB-query failures (attribution for silent pnlPct=null results) */
export const qwenDrawdownPnlQueryErrorsTotal = new client.Counter({
  name: 'algo_trader_qwen_drawdown_monitor_pnl_query_errors_total',
  help: 'Count of computeRollingPnl SELECT failures. Distinguishes DB-connectivity issue (non-zero rate) from "no closed Qwen trades in 24h window" (zero rate + pnlPct=null).',
  registers: [register],
});

/** Counter: signals loop evaluation runs by decision outcome */
export const qwenSignalsLoopRunsTotal = new client.Counter({
  name: 'algo_trader_qwen_signals_loop_runs_total',
  help: 'Total qwen signals loop evaluation runs by decision',
  labelNames: ['decision'] as const,
  registers: [register],
});

/** Gauge: unix-seconds of last signals-loop journal write (liveness probe for 6h cron) */
export const qwenSignalsLoopLastRunTs = new client.Gauge({
  name: 'algo_trader_qwen_signals_loop_last_run_ts',
  help: 'Unix-seconds timestamp of the most recent qwen-signals-loop journal write. Used by QwenSignalsLoopStale freshness alert (time() - gauge > 7h).',
  registers: [register],
});

/** Counter: signals-loop journal INSERT failures (attribution for freshness alerts) */
export const qwenSignalsLoopJournalWriteErrorsTotal = new client.Counter({
  name: 'algo_trader_qwen_signals_loop_journal_write_errors_total',
  help: 'Count of persistRunJournal INSERT failures. Complements QwenSignalsLoopStale: non-zero rate here + stale gauge = DB-write failing; zero rate here + stale gauge = timer dead.',
  registers: [register],
});

/** Counter: DNA journal write failures classified by error type (db_error | timeout | unknown) */
export const journalWriteErrorsTotal = new client.Counter({
  name: 'journal_write_errors_total',
  help: 'Total DNA journal write failures. Label error_type=db_error|timeout|unknown.',
  labelNames: ['error_type'] as const,
  registers: [register],
});

// ─── L-tier rollback visibility (Pillar 2 observability) ─────────────────────

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
  help: 'L3 drawdown auto-disable state (0|1). 1 = swarm disabled by -5% breach',
  registers: [register],
});

/** Gauge: unix-seconds of last drawdown-monitor cycle invocation (liveness probe for 6h cron) */
export const qwenDrawdownMonitorLastRunTs = new client.Gauge({
  name: 'algo_trader_qwen_drawdown_monitor_last_run_ts',
  help: 'Unix-seconds timestamp of the most recent qwen-drawdown-monitor cycle start. Used by QwenDrawdownMonitorStale freshness alert (time() - gauge > 7h).',
  registers: [register],
});

// Counter for total trades executed
export const tradesTotal = new client.Counter({
  name: 'trades_total',
  help: 'Total number of trades executed',
  labelNames: ['symbol', 'exchange', 'side'] as const,
  registers: [register],
});

// Gauge for current P&L in USD
export const dailyPnlUsd = new client.Gauge({
  name: 'daily_pnl_usd',
  help: 'Daily profit and loss in USD',
  labelNames: ['strategy'] as const,
  registers: [register],
});

// Gauge for win rate percentage
export const winRatePercent = new client.Gauge({
  name: 'win_rate_percent',
  help: 'Win rate percentage (winning trades / total trades)',
  labelNames: ['strategy'] as const,
  registers: [register],
});

// Gauge for circuit breaker state (0 = closed/active, 1 = open/halted)
export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0 = active, 1 = halted)',
  registers: [register],
});

// Gauge for number of open positions
export const openPositionsTotal = new client.Gauge({
  name: 'open_positions_total',
  help: 'Total number of open positions',
  labelNames: ['symbol', 'exchange'] as const,
  registers: [register],
});

// Histogram for exchange API latency
export const exchangeApiLatency = new client.Histogram({
  name: 'exchange_api_latency_seconds',
  help: 'Exchange API request latency in seconds',
  labelNames: ['exchange', 'operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Counter for trading signals generated
export const signalsTotal = new client.Counter({
  name: 'signals_total',
  help: 'Total number of trading signals generated',
  labelNames: ['symbol', 'signal_type'] as const,
  registers: [register],
});

// Gauge for strategy active state
export const strategyActive = new client.Gauge({
  name: 'strategy_active',
  help: 'Whether a trading strategy is active (1 = active, 0 = inactive)',
  labelNames: ['strategy'] as const,
  registers: [register],
});

// Histogram for trade execution time
export const tradeExecutionTime = new client.Histogram({
  name: 'trade_execution_time_seconds',
  help: 'Time to execute a trade order',
  labelNames: ['exchange', 'symbol'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Request Metrics Middleware
// ─────────────────────────────────────────────────────────────────────────────

// HTTP request counter
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

// ──── Market Data Metrics ──────────────────────────────────────────────────
const dataGapEvents = new client.Counter({ name: 'market_data_gap_events_total', help: 'Total data gap events', labelNames: ['exchange', 'symbol'] as const, registers: [register], });
const dataGapDuration = new client.Histogram({ name: 'market_data_gap_duration_seconds', help: 'Data gap duration in seconds', buckets: [0.5, 1, 5, 15, 30], registers: [register], });
const gapDetectionDuration = new client.Histogram({ name: 'market_data_gap_detection_seconds', help: 'Gap detection processing time in seconds', buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1], registers: [register], });
const expectedCandles = new client.Gauge({ name: 'market_data_expected_candles', help: 'Expected candle count', registers: [register], });
const receivedCandles = new client.Gauge({ name: 'market_data_received_candles', help: 'Received candle count', registers: [register], });
const candleCompleteness = new client.Gauge({ name: 'market_data_candle_completeness', help: 'Candle completeness ratio (0-1)', registers: [register], });
const outlierEvents = new client.Counter({ name: 'market_data_outlier_events_total', help: 'Total outlier events', labelNames: ['symbol', 'type', 'severity'] as const, registers: [register], });
const outlierZScore = new client.Gauge({ name: 'market_data_outlier_zscore', help: 'Latest outlier Z-score per symbol', labelNames: ['symbol'] as const, registers: [register], });
const providerLatency = new client.Histogram({ name: 'market_data_provider_latency_seconds', help: 'Provider API latency in seconds', labelNames: ['exchange', 'operation'] as const, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5], registers: [register], });
const failoverEvents = new client.Counter({ name: 'market_data_failover_events_total', help: 'Total failover events', labelNames: ['from', 'to', 'reason'] as const, registers: [register], });
const circuitBreakerStateProvider = new client.Gauge({ name: 'market_data_circuit_breaker_state', help: 'Circuit breaker state per provider', labelNames: ['exchange', 'state'], registers: [register], });
const providerHealthScore = new client.Gauge({ name: 'market_data_provider_health_score', help: 'Provider health score (0-100)', labelNames: ['exchange'] as const, registers: [register], });
const providerAvailability = new client.Gauge({ name: 'market_data_provider_availability', help: 'Provider availability (0 or 1)', labelNames: ['exchange'] as const, registers: [register], });
const providerErrorRate = new client.Gauge({ name: 'market_data_provider_error_rate', help: 'Provider error rate (0-1)', labelNames: ['exchange'] as const, registers: [register], });
const slaCompliance = new client.Counter({ name: 'market_data_sla_compliance_total', help: 'SLA compliance events', labelNames: ['exchange', 'compliant'] as const, registers: [register], });

/**
 * Express middleware to track HTTP requests
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const path = req.route?.path || req.path;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = res.statusCode.toString();

    httpRequestsTotal.inc({
      method: req.method,
      path,
      status,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        path,
      },
      duration
    );
  });

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Endpoint Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express handler for /metrics endpoint
 * Returns all metrics in Prometheus format
 */
export async function getMetrics(req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics:', { error });
    res.status(500).send('Error generating metrics');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions for Recording Trading Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a completed trade
 */
export function recordTrade(symbol: string, exchange: string, side: 'buy' | 'sell', pnlUsd?: number): void {
  tradesTotal.inc({ symbol, exchange, side });

  if (pnlUsd !== undefined) {
    // Update daily P&L
    dailyPnlUsd.inc({ strategy: 'default' }, pnlUsd);
  }
}

/**
 * Record a trading signal
 */
export function recordSignal(symbol: string, signalType: 'buy' | 'sell' | 'hold'): void {
  signalsTotal.inc({ symbol, signal_type: signalType });
}

/**
 * Record exchange API latency
 */
export function recordExchangeLatency(exchange: string, operation: string, latencySeconds: number): void {
  exchangeApiLatency.observe({ exchange, operation }, latencySeconds);
}

/**
 * Record trade execution time
 */
export function recordTradeExecutionTime(exchange: string, symbol: string, durationSeconds: number): void {
  tradeExecutionTime.observe({ exchange, symbol }, durationSeconds);
}

/**
 * Update circuit breaker state
 */
export function setCircuitBreakerState(isOpen: boolean): void {
  circuitBreakerState.set(isOpen ? 1 : 0);
}

/**
 * Update win rate
 */
export function setWinRate(winRate: number): void {
  winRatePercent.set({ strategy: 'default' }, winRate);
}

/**
 * Update open positions count
 */
export function setOpenPositions(symbol: string, exchange: string, count: number): void {
  openPositionsTotal.set({ symbol, exchange }, count);
}

/**
 * Set strategy active/inactive
 */
export function setStrategyActive(strategy: string, active: boolean): void {
  strategyActive.set({ strategy }, active ? 1 : 0);
}

/**
 * Set L1 kill-switch state for a given source (env flag or KV lookup).
 * source='env' → QWEN_KILL env var; source='kv' → CF KV / admin route.
 */
export function setQwenKillSwitch(source: 'env' | 'kv', active: boolean): void {
  qwenKillSwitchActive.set({ source }, active ? 1 : 0);
}

/**
 * Set L4 paper-gate days remaining (clamped to [0, 30]).
 * 0 = gate cleared (≥30 days of paper history); 30 = no paper trades yet.
 */
export function setQwenPaperGateDaysRemaining(days: number): void {
  const clamped = Math.max(0, Math.min(30, Math.round(days * 10) / 10));
  qwenPaperGateDaysRemaining.set(clamped);
}

/** Set L3 drawdown auto-disable state. */
export function setQwenDrawdownAutoDisabled(disabled: boolean): void {
  qwenDrawdownAutoDisabled.set(disabled ? 1 : 0);
}

// Export registry for custom metrics
export { register };

// ──── Market Data Metrics ──────────────────────────────────────────────────
/** Record a data gap event */
export function recordDataGap(exchange: string, symbol: string, gapSeconds: number): void {
  dataGapEvents.inc({ exchange, symbol });
  dataGapDuration.observe(gapSeconds);
}
/** Record gap detection duration */
export function recordGapDetectionDuration(exchange: string, symbol: string, durationMs: number): void {
  gapDetectionDuration.observe(durationMs);
}
/** Set expected vs received candle counts */
export function setExpectedCandles(exchange: string, symbol: string, timeframe: string, count: number): void {
  expectedCandles.set(count);
}
export function setReceivedCandles(exchange: string, symbol: string, timeframe: string, count: number): void {
  receivedCandles.set(count);
}
export function setCandleCompleteness(exchange: string, symbol: string, timeframe: string, ratio: number): void {
  candleCompleteness.set(ratio);
}
/** Record outlier detection event */
export function recordOutlierEvent(symbol: string, type: string, severity?: string): void {
  outlierEvents.inc({ symbol, type, severity: severity ?? 'unknown' });
}
export function recordOutlierZScore(symbol: string, _type: string, zScore: number): void {
  outlierZScore.set({ symbol }, zScore);
}
export function recordProviderLatency(exchange: string, operation: string, latencyMs: number): void {
  providerLatency.observe({ exchange, operation }, latencyMs / 1000);
}
/** Record failover event */
export function recordFailoverEvent(fromProvider: string, toProvider: string, reason: string): void {
  failoverEvents.inc({ from: fromProvider, to: toProvider, reason });
}
export function setCircuitBreakerStateProvider(exchange: string, isOpen: boolean): void {
  circuitBreakerStateProvider.set({ exchange }, isOpen ? 1 : 0);
}
/** Set provider health score (0-100) */
export function setProviderHealthScore(exchange: string, _windowHours: number, score: number): void {
  providerHealthScore.set({ exchange }, score);
}
export function setProviderAvailability(exchange: string, _windowHours: number, available: boolean): void {
  providerAvailability.set({ exchange }, available ? 1 : 0);
}
export function setProviderErrorRate(exchange: string, _windowHours: number, rate: number): void {
  providerErrorRate.set({ exchange }, rate);
}
export function recordSlaCompliance(exchange: string, _windowHours: number, compliant: boolean): void {
  slaCompliance.inc({ exchange, compliant: compliant ? 'true' : 'false' });
}
