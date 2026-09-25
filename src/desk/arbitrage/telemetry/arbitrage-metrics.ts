/**
 * Low-latency Prometheus metrics for automated arbitrage execution.
 *
 * Tracks order throughput, execution latency, slippage, and realized PnL.
 *
 * @module desk/arbitrage/telemetry/arbitrage-metrics
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export interface ArbitrageMetricsConfig {
  registry?: Registry;
  prefix?: string;
}

export class ArbitrageMetrics {
  public readonly registry: Registry;
  private readonly ordersTotal: Counter<string>;
  private readonly executionLatency: Histogram<string>;
  private readonly slippageBps: Histogram<string>;
  private readonly pnlUsdTotal: Counter<string>;
  private readonly unwindsTotal: Counter<string>;
  private readonly activeExecutions: Gauge<string>;

  constructor(config?: ArbitrageMetricsConfig) {
    this.registry = config?.registry ?? new Registry();
    const prefix = config?.prefix ?? 'arb_';

    this.ordersTotal = new Counter({
      name: `${prefix}orders_total`,
      help: 'Total number of arbitrage orders attempted',
      labelNames: ['venue', 'status', 'strategy'] as const,
      registers: [this.registry],
    });

    this.executionLatency = new Histogram({
      name: `${prefix}execution_latency_ms`,
      help: 'Execution latency in milliseconds',
      labelNames: ['venue', 'strategy'] as const,
      buckets: [5, 15, 30, 50, 100, 250, 500, 1000, 2000, 5000],
      registers: [this.registry],
    });

    this.slippageBps = new Histogram({
      name: `${prefix}slippage_bps`,
      help: 'Realized slippage in basis points',
      labelNames: ['venue', 'symbol'] as const,
      buckets: [0, 1, 2, 5, 10, 20, 50, 100],
      registers: [this.registry],
    });

    this.pnlUsdTotal = new Counter({
      name: `${prefix}pnl_usd`,
      help: 'Cumulative realized net PnL in USD',
      labelNames: ['strategy', 'result'] as const,
      registers: [this.registry],
    });

    this.unwindsTotal = new Counter({
      name: `${prefix}unwinds_total`,
      help: 'Total compensatory unwind procedures triggered',
      labelNames: ['venue', 'success'] as const,
      registers: [this.registry],
    });

    this.activeExecutions = new Gauge({
      name: `${prefix}active_executions`,
      help: 'Number of arbitrage multi-leg orders currently executing',
      registers: [this.registry],
    });
  }

  recordOrder(venue: string, status: string, strategy: string): void {
    this.ordersTotal.inc({ venue, status, strategy });
  }

  recordExecutionLatency(venue: string, strategy: string, latencyMs: number): void {
    this.executionLatency.observe({ venue, strategy }, Math.max(0, latencyMs));
  }

  recordSlippage(venue: string, symbol: string, slippageBps: number): void {
    this.slippageBps.observe({ venue, symbol }, Math.max(0, slippageBps));
  }

  recordPnl(strategy: string, pnlUsd: number): void {
    const result = pnlUsd >= 0 ? 'profit' : 'loss';
    this.pnlUsdTotal.inc({ strategy, result }, Math.abs(pnlUsd));
  }

  recordUnwind(venue: string, success: boolean): void {
    this.unwindsTotal.inc({ venue, success: success ? 'true' : 'false' });
  }

  incActiveExecutions(): void {
    this.activeExecutions.inc();
  }

  decActiveExecutions(): void {
    this.activeExecutions.dec();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  reset(): void {
    this.registry.clear();
  }
}
