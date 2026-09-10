/**
 * Prometheus Metric Definitions — Core Trading, HTTP, and Market Data
 *
 * Submodule extracted from prometheus-metrics-definitions.ts to keep files under 200 lines.
 * All metrics register against the shared registry from prometheus-registry.ts.
 */
import client from 'prom-client';
import { register } from './prometheus-registry';

// ═══════════════════════════════════════════════════════════════════════════════
// Core Trading Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/** Counter: total trades executed */
export const tradesTotalDef = new client.Counter({
  name: 'trades_total_v2',
  help: 'Total number of trades executed',
  labelNames: ['symbol', 'exchange', 'side'] as const,
  registers: [register],
});

/** Gauge: daily P&L in USD */
export const dailyPnlUsdDef = new client.Gauge({
  name: 'daily_pnl_usd_v2',
  help: 'Daily profit and loss in USD',
  labelNames: ['strategy'] as const,
  registers: [register],
});

/** Gauge: win rate percentage */
export const winRatePercentDef = new client.Gauge({
  name: 'win_rate_percent_v2',
  help: 'Win rate percentage (winning trades / total trades)',
  labelNames: ['strategy'] as const,
  registers: [register],
});

/** Gauge: circuit breaker state (0 = active, 1 = halted) */
export const circuitBreakerStateDef = new client.Gauge({
  name: 'circuit_breaker_state_v2',
  help: 'Circuit breaker state (0 = active, 1 = halted)',
  registers: [register],
});

/** Gauge: number of open positions */
export const openPositionsTotalDef = new client.Gauge({
  name: 'open_positions_total_v2',
  help: 'Total number of open positions',
  labelNames: ['symbol', 'exchange'] as const,
  registers: [register],
});

/** Histogram: exchange API request latency in seconds */
export const exchangeApiLatencyDef = new client.Histogram({
  name: 'exchange_api_latency_seconds_v2',
  help: 'Exchange API request latency in seconds',
  labelNames: ['exchange', 'operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

/** Counter: total trading signals generated */
export const signalsTotalDef = new client.Counter({
  name: 'signals_total_v2',
  help: 'Total number of trading signals generated',
  labelNames: ['symbol', 'signal_type'] as const,
  registers: [register],
});

/** Gauge: strategy active state (1 = active, 0 = inactive) */
export const strategyActiveDef = new client.Gauge({
  name: 'strategy_active_v2',
  help: 'Whether a trading strategy is active (1 = active, 0 = inactive)',
  labelNames: ['strategy'] as const,
  registers: [register],
});

/** Histogram: trade execution time in seconds */
export const tradeExecutionTimeDef = new client.Histogram({
  name: 'trade_execution_time_seconds_v2',
  help: 'Time to execute a trade order',
  labelNames: ['exchange', 'symbol'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP Request Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/** Counter: total HTTP requests */
export const httpRequestsTotalDef = new client.Counter({
  name: 'http_requests_total_v2',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

/** Histogram: HTTP request duration in seconds */
export const httpRequestDurationDef = new client.Histogram({
  name: 'http_request_duration_seconds_v2',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

// ═══════════════════════════════════════════════════════════════════════════════
// Market Data Metrics
// ═══════════════════════════════════════════════════════════════════════════════

export const dataGapEventsDef = new client.Counter({
  name: 'market_data_gap_events_total_v2', help: 'Total data gap events',
  labelNames: ['exchange', 'symbol'] as const, registers: [register],
});
export const dataGapDurationDef = new client.Histogram({
  name: 'market_data_gap_duration_seconds_v2', help: 'Data gap duration in seconds',
  buckets: [0.5, 1, 5, 15, 30], registers: [register],
});
export const gapDetectionDurationDef = new client.Histogram({
  name: 'market_data_gap_detection_seconds_v2', help: 'Gap detection processing time in seconds',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1], registers: [register],
});
export const expectedCandlesDef = new client.Gauge({
  name: 'market_data_expected_candles_v2', help: 'Expected candle count', registers: [register],
});
export const receivedCandlesDef = new client.Gauge({
  name: 'market_data_received_candles_v2', help: 'Received candle count', registers: [register],
});
export const candleCompletenessDef = new client.Gauge({
  name: 'market_data_candle_completeness_v2', help: 'Candle completeness ratio (0-1)', registers: [register],
});
export const outlierEventsDef = new client.Counter({
  name: 'market_data_outlier_events_total_v2', help: 'Total outlier events',
  labelNames: ['symbol', 'type', 'severity'] as const, registers: [register],
});
export const outlierZScoreDef = new client.Gauge({
  name: 'market_data_outlier_zscore_v2', help: 'Latest outlier Z-score per symbol',
  labelNames: ['symbol'] as const, registers: [register],
});
export const providerLatencyDef = new client.Histogram({
  name: 'market_data_provider_latency_seconds_v2', help: 'Provider API latency in seconds',
  labelNames: ['exchange', 'operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5], registers: [register],
});
export const failoverEventsDef = new client.Counter({
  name: 'market_data_failover_events_total_v2', help: 'Total failover events',
  labelNames: ['from', 'to', 'reason'] as const, registers: [register],
});
export const circuitBreakerStateProviderDef = new client.Gauge({
  name: 'market_data_circuit_breaker_state_v2', help: 'Circuit breaker state per provider',
  labelNames: ['exchange', 'state'], registers: [register],
});
export const providerHealthScoreDef = new client.Gauge({
  name: 'market_data_provider_health_score_v2', help: 'Provider health score (0-100)',
  labelNames: ['exchange'] as const, registers: [register],
});
export const providerAvailabilityDef = new client.Gauge({
  name: 'market_data_provider_availability_v2', help: 'Provider availability (0 or 1)',
  labelNames: ['exchange'] as const, registers: [register],
});
export const providerErrorRateDef = new client.Gauge({
  name: 'market_data_provider_error_rate_v2', help: 'Provider error rate (0-1)',
  labelNames: ['exchange'] as const, registers: [register],
});
export const slaComplianceDef = new client.Counter({
  name: 'market_data_sla_compliance_total_v2', help: 'SLA compliance events',
  labelNames: ['exchange', 'compliant'] as const, registers: [register],
});
