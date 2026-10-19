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
// Market Data Metrics (re-exported for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export * from './prometheus-metrics-definitions-market';
