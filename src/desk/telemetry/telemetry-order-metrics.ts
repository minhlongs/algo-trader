/**
 * Telemetry Order & Execution Metrics (Milestone 4 - R4)
 * Prometheus metrics for order lifecycle transitions, latency, and realized slippage.
 */

import { Counter, Gauge, Histogram } from 'prom-client';

export const orderLifecycleTotal = new Counter({
  name: 'order_lifecycle_total',
  help: 'Total count of order lifecycle events',
  labelNames: ['event_type', 'engine', 'venue', 'mode'] as const,
});

export const orderExecutionLatencyMs = new Histogram({
  name: 'order_execution_latency_ms',
  help: 'Order execution latency in milliseconds',
  labelNames: ['venue', 'mode'] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
});

export const orderRealizedSlippageBps = new Gauge({
  name: 'order_realized_slippage_bps',
  help: 'Realized slippage in basis points',
  labelNames: ['symbol', 'venue', 'mode'] as const,
});

export class OrderMetricsCollector {
  private readonly counts: Record<string, number> = {};

  public recordEvent(eventType: string, engine: string, venue: string, mode: string): void {
    orderLifecycleTotal.inc({ event_type: eventType, engine, venue, mode });
    this.counts[eventType] = (this.counts[eventType] ?? 0) + 1;
  }

  public recordLatency(venue: string, mode: string, latencyMs: number): void {
    orderExecutionLatencyMs.observe({ venue, mode }, latencyMs);
  }

  public recordSlippage(symbol: string, venue: string, mode: string, slippageBps: number): void {
    orderRealizedSlippageBps.set({ symbol, venue, mode }, slippageBps);
  }

  public getCounts(): Readonly<Record<string, number>> {
    return this.counts;
  }
}
