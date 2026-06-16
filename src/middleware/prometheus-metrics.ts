/**
 * Prometheus Metrics Middleware
 * Exposes Prometheus-format metrics for monitoring and alerting
 */

import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { annotateActiveSpanWithRegion } from '../utils/tracing';

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

// ─── Memory Metrics (Task 6 - Memory Optimization) ─────────────────────────────

/** Gauge: Resident Set Size (RSS) memory in bytes */
export const memoryRssBytes = new client.Gauge({
  name: 'algo_trader_memory_rss_bytes',
  help: 'Resident Set Size (RSS) memory usage in bytes. Total memory allocated to the process including all heap, stack, and native allocations.',
  registers: [register],
});

/** Gauge: Heap used memory in bytes */
export const memoryHeapBytes = new client.Gauge({
  name: 'algo_trader_memory_heap_bytes',
  help: 'JavaScript heap used memory in bytes. Current active heap allocations.',
  registers: [register],
});

/** Gauge: Memory utilization ratio (0-1) */
export const memoryUtilizationRatio = new client.Gauge({
  name: 'algo_trader_memory_utilization_ratio',
  help: 'Memory utilization ratio (RSS / limit). 0 = 0%, 1 = 100% of 128MB Cloudflare Worker limit. Thresholds: warning=0.78 (100MB), critical=0.90 (115MB).',
  registers: [register],
});

/** Counter: number of memory pressure events by level */
export const memoryPressureEventsTotal = new client.Counter({
  name: 'algo_trader_memory_pressure_events_total',
  help: 'Total number of memory pressure events triggered by level.',
  labelNames: ['level'] as const, // level: warning | critical
  registers: [register],
});

/** Counter: cache evictions by cache type */
export const cacheEvictionsTotal = new client.Counter({
  name: 'algo_trader_cache_evictions_total',
  help: 'Total number of cache evictions by cache type.',
  labelNames: ['cache_type'] as const, // cache_type: strategy | market_data | agent_context
  registers: [register],
});

/** Gauge: compression ratio for compressed data */
export const compressionRatio = new client.Gauge({
  name: 'algo_trader_compression_ratio',
  help: 'Compression ratio achieved (original_size / compressed_size). Higher is better. Target: >1.5x for JSON data.',
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

// ─── Latency Monitoring Histograms (Phase 5) ───────────────────────────────────

/** HTTP request duration with region and status labels */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'region', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** External API latency (Polymarket, exchanges, LLM gateways) */
export const externalApiLatency = new client.Histogram({
  name: 'external_api_latency_seconds',
  help: 'External API call latency in seconds',
  labelNames: ['service', 'endpoint', 'region'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/** Durable Object shard latency */
export const shardLatency = new client.Histogram({
  name: 'shard_latency_seconds',
  help: 'Durable Object shard operation latency',
  labelNames: ['shard_id', 'operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [register],
});

/** Agent queue wait time */
export const queueWaitTime = new client.Histogram({
  name: 'queue_wait_seconds',
  help: 'Agent queue wait time before processing',
  labelNames: ['priority', 'agent', 'tier'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Extract region from Cloudflare request headers or context
 */
function getRegionFromRequest(req: Request): string {
  // CF provides region via cf-colo header
  try {
    const headers = req.headers as any;
    return headers.get?.('cf-colo') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Metrics tracking middleware with region context
 * Records HTTP request duration to Prometheus with region and status labels
 * Also annotates OpenTelemetry spans with region.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const region = getRegionFromRequest(req);
  const route = req.route?.path || req.path;
  const method = req.method;

  // Annotate active span with region (if tracing enabled)
  annotateActiveSpanWithRegion(region);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = res.statusCode.toString();

    httpRequestDuration.observe({ method, route, region, status }, duration);
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

/**
 * Update memory metrics from MemoryPressureHandler
 * Called every 5s by memory pressure monitoring
 */
export function setMemoryMetrics(
  rssBytes: number,
  heapBytes: number,
  limitBytes: number
): void {
  memoryRssBytes.set(rssBytes);
  memoryHeapBytes.set(heapBytes);
  memoryUtilizationRatio.set(rssBytes / limitBytes);
}

/**
 * Record memory pressure event
 */
export function recordMemoryPressureEvent(level: 'warning' | 'critical'): void {
  memoryPressureEventsTotal.inc({ level });
}

/**
 * Record cache eviction
 */
export function recordCacheEviction(cacheType: 'strategy' | 'market_data' | 'agent_context'): void {
  cacheEvictionsTotal.inc({ cache_type: cacheType });
}

/**
 * Record compression ratio
 */
export function recordCompressionRatio(originalSize: number, compressedSize: number): void {
  if (compressedSize > 0) {
    compressionRatio.set(originalSize / compressedSize);
  }
}

// Helper function to record external API latency (with region)
export function recordExternalApiLatency(service: string, endpoint: string, region: string, latencySeconds: number): void {
  externalApiLatency.observe({ service, endpoint, region }, latencySeconds);
}

// Helper function to record shard latency
export function recordShardLatency(shardId: string, operation: string, latencySeconds: number): void {
  shardLatency.observe({ shard_id: shardId, operation }, latencySeconds);
}

// Helper function to record queue wait time
export function recordQueueWaitTime(priority: number, agent: string, tier: string, waitSeconds: number): void {
  queueWaitTime.observe({ priority: String(priority), agent, tier }, waitSeconds);
}

// Export registry for custom metrics
export { register };
