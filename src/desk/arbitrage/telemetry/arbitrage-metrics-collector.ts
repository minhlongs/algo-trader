/**
 * Object-Oriented Metrics Class (for Dependency Injection and Test Isolation)
 *
 * @module desk/arbitrage/telemetry/arbitrage-metrics-collector
 */

import client from 'prom-client';
import {
  recordArbOrder,
  recordArbLatency,
  recordArbSlippage,
  recordArbPnl,
} from './arbitrage-metrics-recorders';

export interface ArbitrageMetricsConfig {
  registry?: client.Registry;
  prefix?: string;
}

export class ArbitrageMetrics {
  public readonly registry: client.Registry;
  private readonly ordersTotal: client.Counter<string>;
  private readonly executionLatency: client.Histogram<string>;
  private readonly slippageBps: client.Histogram<string>;
  private readonly pnlUsdTotal: client.Counter<string>;
  private readonly unwindsTotal: client.Counter<string>;
  private readonly activeExecutions: client.Gauge<string>;

  constructor(config?: ArbitrageMetricsConfig) {
    this.registry = config?.registry ?? new client.Registry();
    const prefix = config?.prefix ?? 'arb_';

    this.ordersTotal = new client.Counter({
      name: `${prefix}orders_total`,
      help: 'Total number of arbitrage orders attempted',
      labelNames: ['venue', 'status', 'strategy'] as const,
      registers: [this.registry],
    });

    this.executionLatency = new client.Histogram({
      name: `${prefix}execution_latency_ms`,
      help: 'Execution latency in milliseconds',
      labelNames: ['venue', 'strategy'] as const,
      buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.slippageBps = new client.Histogram({
      name: `${prefix}slippage_bps`,
      help: 'Realized slippage in basis points',
      labelNames: ['venue', 'symbol'] as const,
      buckets: [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200],
      registers: [this.registry],
    });

    this.pnlUsdTotal = new client.Counter({
      name: `${prefix}pnl_usd`,
      help: 'Cumulative realized net PnL in USD',
      labelNames: ['strategy', 'result'] as const,
      registers: [this.registry],
    });

    this.unwindsTotal = new client.Counter({
      name: `${prefix}unwinds_total`,
      help: 'Total compensatory unwind procedures triggered',
      labelNames: ['venue', 'success'] as const,
      registers: [this.registry],
    });

    this.activeExecutions = new client.Gauge({
      name: `${prefix}active_executions`,
      help: 'Number of arbitrage multi-leg orders currently executing',
      registers: [this.registry],
    });
  }

  recordOrder(venue: string, status: string, strategy = 'cross-exchange'): void {
    this.ordersTotal.inc({ venue, status, strategy });
    recordArbOrder({
      strategyType: strategy,
      venue,
      status,
      leg: 'leg1',
      side: 'buy',
      mode: 'dry-run',
    });
  }

  recordExecutionLatency(
    venueOrStrategy: string,
    strategyOrPhase: string,
    latencyMs: number,
  ): void {
    this.executionLatency.observe(
      { venue: venueOrStrategy, strategy: strategyOrPhase },
      Math.max(0, latencyMs),
    );
    recordArbLatency({
      strategyType: strategyOrPhase,
      phase: 'roundtrip',
      status: 'success',
      latencyMs,
    });
  }

  recordSlippage(venue: string, symbol: string, slippageBps: number): void {
    this.slippageBps.observe({ venue, symbol }, Math.max(0, slippageBps));
    recordArbSlippage({
      strategyType: 'cross-exchange',
      venue,
      symbol,
      side: 'buy',
      slippageBps,
    });
  }

  recordPnl(strategy: string, pnlUsd: number, venuePair = 'cross-venue'): void {
    const result = pnlUsd >= 0 ? 'profit' : 'loss';
    this.pnlUsdTotal.inc({ strategy, result }, Math.abs(pnlUsd));
    recordArbPnl({
      strategyType: strategy,
      venuePair,
      result: pnlUsd >= 0 ? 'win' : 'loss',
      pnlUsd,
    });
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
    this.registry.resetMetrics();
  }
}
