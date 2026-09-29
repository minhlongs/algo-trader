/**
 * Low-latency Prometheus metrics for automated arbitrage execution.
 *
 * Implements Milestone 4 (Requirement R4) telemetry:
 * - arb_orders_total: Counter with ['strategy_type', 'venue', 'leg', 'side', 'status', 'mode']
 * - arb_execution_latency_ms: Histogram with ['strategy_type', 'phase', 'status'] and latency buckets
 * - arb_slippage_bps: Histogram with ['strategy_type', 'venue', 'symbol', 'side'] and slippage buckets
 * - arb_pnl_usd: Gauge / Counter with ['strategy_type', 'venue_pair', 'result']
 *
 * Provides dedicated helper recorder functions:
 * recordArbOrder(), recordArbLatency(), recordArbSlippage(), recordArbPnl().
 *
 * @module desk/arbitrage/arbitrage-metrics
 */

export * from './telemetry/arbitrage-metrics-definitions';
export * from './telemetry/arbitrage-metrics-recorders';
export * from './telemetry/arbitrage-metrics-collector';
