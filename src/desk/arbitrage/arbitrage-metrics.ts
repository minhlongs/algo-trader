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

import client from 'prom-client';
import { register as platformRegister } from '../../platform/middleware/prometheus-registry';

// ── Prometheus Metric Registrations ──────────────────────────────────────────

function getOrCreateMetric<T extends client.Metric<string>>(
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
  platformRegister,
  'arb_orders_total',
  () =>
    new client.Counter({
      name: 'arb_orders_total',
      help: 'Total multi-leg and single-leg arbitrage orders across venues, legs, and lifecycle states',
      labelNames: ['strategy_type', 'venue', 'leg', 'side', 'status', 'mode'] as const,
      registers: [platformRegister],
    }),
);

/**
 * 2. arb_execution_latency_ms: Millisecond-precision multi-leg latency.
 * Labels: strategy_type, phase, status
 * Buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] ms.
 */
export const arbExecutionLatencyMs = getOrCreateMetric(
  platformRegister,
  'arb_execution_latency_ms',
  () =>
    new client.Histogram({
      name: 'arb_execution_latency_ms',
      help: 'Arbitrage order execution and unwind latency in milliseconds',
      labelNames: ['strategy_type', 'phase', 'status'] as const,
      buckets: [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [platformRegister],
    }),
);

/**
 * 3. arb_slippage_bps: Execution slippage relative to detected opportunity price in basis points.
 * Labels: strategy_type, venue, symbol, side
 * Buckets: [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200] bps.
 */
export const arbSlippageBps = getOrCreateMetric(
  platformRegister,
  'arb_slippage_bps',
  () =>
    new client.Histogram({
      name: 'arb_slippage_bps',
      help: 'Realized arbitrage execution slippage in basis points',
      labelNames: ['strategy_type', 'venue', 'symbol', 'side'] as const,
      buckets: [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200],
      registers: [platformRegister],
    }),
);

/**
 * 4. arb_pnl_usd: Realized net profit/loss from arbitrage trades in USD.
 * Labels: strategy_type, venue_pair, result
 */
export const arbPnlUsd = getOrCreateMetric(
  platformRegister,
  'arb_pnl_usd',
  () =>
    new client.Gauge({
      name: 'arb_pnl_usd',
      help: 'Realized net profit/loss from arbitrage trades in USD',
      labelNames: ['strategy_type', 'venue_pair', 'result'] as const,
      registers: [platformRegister],
    }),
);

// ── Helper Recorder Interfaces & Implementations ─────────────────────────────

export interface RecordArbOrderParams {
  strategyType?: string;
  venue: string;
  leg?: string;
  side?: 'buy' | 'sell' | string;
  status: string;
  mode?: string;
}

export function recordArbOrder(params: RecordArbOrderParams): void;
export function recordArbOrder(
  strategyType: string,
  venue: string,
  leg: string,
  side: string,
  status: string,
  mode: string,
): void;
export function recordArbOrder(
  strategyOrParams: string | RecordArbOrderParams,
  venue?: string,
  leg?: string,
  side?: string,
  status?: string,
  mode?: string,
): void {
  if (typeof strategyOrParams === 'object') {
    arbOrdersTotal.inc({
      strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
      venue: strategyOrParams.venue,
      leg: strategyOrParams.leg ?? 'leg1',
      side: strategyOrParams.side ?? 'buy',
      status: strategyOrParams.status,
      mode: strategyOrParams.mode ?? 'dry-run',
    });
  } else {
    arbOrdersTotal.inc({
      strategy_type: strategyOrParams,
      venue: venue ?? 'unknown',
      leg: leg ?? 'leg1',
      side: side ?? 'buy',
      status: status ?? 'submitted',
      mode: mode ?? 'dry-run',
    });
  }
}

export interface RecordArbLatencyParams {
  strategyType?: string;
  phase?: string;
  status?: string;
  latencyMs: number;
}

export function recordArbLatency(params: RecordArbLatencyParams): void;
export function recordArbLatency(
  strategyType: string,
  phase: string,
  status: string,
  latencyMs: number,
): void;
export function recordArbLatency(
  strategyOrParams: string | RecordArbLatencyParams,
  phaseOrLatency?: string | number,
  status?: string,
  latencyMs?: number,
): void {
  if (typeof strategyOrParams === 'object') {
    arbExecutionLatencyMs.observe(
      {
        strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
        phase: strategyOrParams.phase ?? 'roundtrip',
        status: strategyOrParams.status ?? 'success',
      },
      Math.max(0, strategyOrParams.latencyMs),
    );
  } else if (typeof phaseOrLatency === 'number') {
    arbExecutionLatencyMs.observe(
      {
        strategy_type: strategyOrParams,
        phase: 'roundtrip',
        status: status ?? 'success',
      },
      Math.max(0, phaseOrLatency),
    );
  } else {
    arbExecutionLatencyMs.observe(
      {
        strategy_type: strategyOrParams,
        phase: phaseOrLatency ?? 'roundtrip',
        status: status ?? 'success',
      },
      Math.max(0, latencyMs ?? 0),
    );
  }
}

export interface RecordArbSlippageParams {
  strategyType?: string;
  venue: string;
  symbol: string;
  side?: string;
  slippageBps: number;
}

export function recordArbSlippage(params: RecordArbSlippageParams): void;
export function recordArbSlippage(
  strategyType: string,
  venue: string,
  symbol: string,
  side: string,
  slippageBps: number,
): void;
export function recordArbSlippage(
  strategyOrParams: string | RecordArbSlippageParams,
  venueOrSymbol?: string,
  symbolOrSlippage?: string | number,
  side?: string,
  slippageBps?: number,
): void {
  if (typeof strategyOrParams === 'object') {
    arbSlippageBps.observe(
      {
        strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
        venue: strategyOrParams.venue,
        symbol: strategyOrParams.symbol,
        side: strategyOrParams.side ?? 'buy',
      },
      strategyOrParams.slippageBps,
    );
  } else if (typeof symbolOrSlippage === 'number') {
    arbSlippageBps.observe(
      {
        strategy_type: 'cross-exchange',
        venue: strategyOrParams,
        symbol: venueOrSymbol ?? 'UNKNOWN',
        side: side ?? 'buy',
      },
      symbolOrSlippage,
    );
  } else {
    arbSlippageBps.observe(
      {
        strategy_type: strategyOrParams,
        venue: venueOrSymbol ?? 'unknown',
        symbol: (symbolOrSlippage as string) ?? 'UNKNOWN',
        side: side ?? 'buy',
      },
      slippageBps ?? 0,
    );
  }
}

export interface RecordArbPnlParams {
  strategyType?: string;
  venuePair?: string;
  result?: 'win' | 'loss' | 'unwound_loss' | string;
  pnlUsd: number;
}

export function recordArbPnl(params: RecordArbPnlParams): void;
export function recordArbPnl(
  strategyType: string,
  venuePair: string,
  result: string,
  pnlUsd: number,
): void;
export function recordArbPnl(
  strategyOrParams: string | RecordArbPnlParams,
  venuePairOrPnl?: string | number,
  resultOrPnl?: string | number,
  pnlUsd?: number,
): void {
  if (typeof strategyOrParams === 'object') {
    const res =
      strategyOrParams.result ?? (strategyOrParams.pnlUsd >= 0 ? 'win' : 'loss');
    arbPnlUsd.set(
      {
        strategy_type: strategyOrParams.strategyType ?? 'cross-exchange',
        venue_pair: strategyOrParams.venuePair ?? 'cross-venue',
        result: res,
      },
      strategyOrParams.pnlUsd,
    );
  } else if (typeof venuePairOrPnl === 'number') {
    const pnl = venuePairOrPnl;
    arbPnlUsd.set(
      {
        strategy_type: strategyOrParams,
        venue_pair: 'cross-venue',
        result: pnl >= 0 ? 'win' : 'loss',
      },
      pnl,
    );
  } else {
    const pnl = pnlUsd ?? 0;
    const res =
      typeof resultOrPnl === 'string'
        ? resultOrPnl
        : pnl >= 0
          ? 'win'
          : 'loss';
    arbPnlUsd.set(
      {
        strategy_type: strategyOrParams,
        venue_pair: (venuePairOrPnl as string) ?? 'cross-venue',
        result: res,
      },
      pnl,
    );
  }
}

// ── Object-Oriented Metrics Class (for DI and Test Isolation) ────────────────

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
