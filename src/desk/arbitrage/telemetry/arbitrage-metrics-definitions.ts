/**
 * Canonical Prometheus Metric Registrations for Arbitrage Execution.
 *
 * Implements Milestone 4 (Requirement R4) telemetry:
 * - arb_orders_total: Counter with ['strategy_type', 'venue', 'leg', 'side', 'status', 'mode']
 * - arb_execution_latency_ms: Histogram with ['strategy_type', 'phase', 'status'] and latency buckets
 * - arb_slippage_bps: Histogram with ['strategy_type', 'venue', 'symbol', 'side'] and slippage buckets
 * - arb_pnl_usd: Gauge / Counter with ['strategy_type', 'venue_pair', 'result']
 *
 * @module desk/arbitrage/telemetry/arbitrage-metrics-definitions
 */

import client from 'prom-client';

const defaultRegister = client.register;

export function getOrCreateMetric<T extends client.Metric<string>>(
  registry: client.Registry,
  name: string,
  createFn: () => T,
): T {
  const existing = registry.getSingleMetric(name);
  if (existing) {
    return existing as T;
  }
  return createFn();
}

/**
 * 1. arb_orders_total: Total multi-leg and single-leg arbitrage orders.
 * Labels: strategy_type, venue, leg, side, status, mode
 */
export const arbOrdersTotal = getOrCreateMetric(
  defaultRegister,
  'arb_orders_total',
  () =>
    new client.Counter({
      name: 'arb_orders_total',
      help: 'Total multi-leg and single-leg arbitrage orders across venues, legs, and lifecycle states',
      labelNames: ['strategy_type', 'venue', 'leg', 'side', 'status', 'mode'] as const,
      registers: [defaultRegister],
    }),
);

/**
 * 2. arb_execution_latency_ms: Millisecond-precision multi-leg latency.
 * Labels: strategy_type, phase, status
 * Buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] ms.
 */
export const arbExecutionLatencyMs = getOrCreateMetric(
  defaultRegister,
  'arb_execution_latency_ms',
  () =>
    new client.Histogram({
      name: 'arb_execution_latency_ms',
      help: 'Arbitrage order execution and unwind latency in milliseconds',
      labelNames: ['strategy_type', 'phase', 'status'] as const,
      buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [defaultRegister],
    }),
);

/**
 * 3. arb_slippage_bps: Execution slippage relative to detected opportunity price in basis points.
 * Labels: strategy_type, venue, symbol, side
 * Buckets: [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200] bps.
 */
export const arbSlippageBps = getOrCreateMetric(
  defaultRegister,
  'arb_slippage_bps',
  () =>
    new client.Histogram({
      name: 'arb_slippage_bps',
      help: 'Realized arbitrage execution slippage in basis points',
      labelNames: ['strategy_type', 'venue', 'symbol', 'side'] as const,
      buckets: [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200],
      registers: [defaultRegister],
    }),
);

/**
 * 4. arb_pnl_usd: Realized net profit/loss from arbitrage trades in USD.
 * Labels: strategy_type, venue_pair, result
 */
export const arbPnlUsd = getOrCreateMetric(
  defaultRegister,
  'arb_pnl_usd',
  () =>
    new client.Gauge({
      name: 'arb_pnl_usd',
      help: 'Realized net profit/loss from arbitrage trades in USD',
      labelNames: ['strategy_type', 'venue_pair', 'result'] as const,
      registers: [defaultRegister],
    }),
);
