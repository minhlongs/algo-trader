/**
 * Prometheus Metric Definitions — Market Data & Provider Health Metrics
 *
 * Extracted from prometheus-metrics-definitions-trading-http-market.ts.
 * Re-exported via prometheus-metrics-definitions-trading-http-market.ts.
 */
import client from 'prom-client';
import { register } from './prometheus-registry';

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
