/**
 * Desk Metrics Registry — Isolated Prometheus Telemetry for Autonomous Desk Runner
 * Milestone M4: Telemetry & HTTP Status Server
 */

import client from 'prom-client';

export interface DeskTelemetrySnapshot {
  readonly allocatedCapital?: Record<string, number>;
  readonly queueDepth?: number;
  readonly fillRate?: number;
  readonly realizedSlippageBps?: number;
  readonly circuitBreakerTier?: string;
  readonly driftUsd?: number;
}

export const KNOWN_CIRCUIT_BREAKER_TIERS = [
  'NORMAL',
  'ALERT',
  'REDUCE',
  'HALT',
  'HARD_STOP',
] as const;

export class DeskMetricsRegistry {
  public readonly registry: client.Registry;

  public readonly engineAllocatedCapitalUsd: client.Gauge<'engine'>;
  public readonly priorityQueueDepth: client.Gauge<string>;
  public readonly ordersFillRate: client.Gauge<string>;
  public readonly realizedSlippageBps: client.Gauge<string>;
  public readonly circuitBreakerTier: client.Gauge<'tier'>;
  public readonly accountingDriftUsd: client.Gauge<string>;
  public readonly zeroDriftCompliant: client.Gauge<string>;
  public readonly queueShedTotal: client.Counter<'urgency'>;

  constructor(customRegistry?: client.Registry) {
    this.registry = customRegistry ?? new client.Registry();

    this.engineAllocatedCapitalUsd = new client.Gauge({
      name: 'desk_engine_allocated_capital_usd',
      help: 'Allocated capital in USD partitioned by trading engine',
      labelNames: ['engine'] as const,
      registers: [this.registry],
    });

    this.priorityQueueDepth = new client.Gauge({
      name: 'desk_priority_queue_depth',
      help: 'Current depth of desk trade intent priority queue',
      registers: [this.registry],
    });

    this.ordersFillRate = new client.Gauge({
      name: 'desk_orders_fill_rate',
      help: 'Ratio of executed orders to total submitted orders (0.0 to 1.0)',
      registers: [this.registry],
    });

    this.realizedSlippageBps = new client.Gauge({
      name: 'desk_realized_slippage_bps',
      help: 'Realized execution slippage in basis points',
      registers: [this.registry],
    });

    this.circuitBreakerTier = new client.Gauge({
      name: 'desk_circuit_breaker_tier',
      help: 'State of desk circuit breaker tier (1 for active tier, 0 otherwise)',
      labelNames: ['tier'] as const,
      registers: [this.registry],
    });

    this.accountingDriftUsd = new client.Gauge({
      name: 'desk_accounting_drift_usd',
      help: 'Accounting drift in USD between NAV and allocated capital plus cash',
      registers: [this.registry],
    });

    this.zeroDriftCompliant = new client.Gauge({
      name: 'desk_zero_drift_compliant',
      help: 'Zero accounting drift compliance flag: 1 if drift < 1e-4 USD, 0 otherwise',
      registers: [this.registry],
    });

    this.queueShedTotal = new client.Counter({
      name: 'desk_queue_shed_total',
      help: 'Total trade intents dropped or shed due to queue backpressure',
      labelNames: ['urgency'] as const,
      registers: [this.registry],
    });

    // Default zero drift compliant on initialization
    this.zeroDriftCompliant.set(1);
  }

  public setEngineAllocatedCapital(engine: string, amountUsd: number): void {
    this.engineAllocatedCapitalUsd.set({ engine }, Math.max(0, amountUsd));
  }

  public setPriorityQueueDepth(depth: number): void {
    this.priorityQueueDepth.set(Math.max(0, Math.floor(depth)));
  }

  public setOrdersFillRate(rate: number): void {
    const clamped = Math.max(0, Math.min(1, rate));
    this.ordersFillRate.set(clamped);
  }

  public setRealizedSlippageBps(bps: number): void {
    this.realizedSlippageBps.set(bps);
  }

  public setCircuitBreakerTier(activeTier: string): void {
    const normalized = activeTier.toUpperCase();
    for (const tier of KNOWN_CIRCUIT_BREAKER_TIERS) {
      this.circuitBreakerTier.set({ tier }, tier === normalized ? 1 : 0);
    }
    if (!KNOWN_CIRCUIT_BREAKER_TIERS.includes(normalized as typeof KNOWN_CIRCUIT_BREAKER_TIERS[number])) {
      this.circuitBreakerTier.set({ tier: normalized }, 1);
    }
  }

  public setAccountingDriftUsd(driftUsd: number): void {
    const nonNegativeDrift = Math.max(0, driftUsd);
    this.accountingDriftUsd.set(nonNegativeDrift);
    this.zeroDriftCompliant.set(nonNegativeDrift < 1e-4 ? 1 : 0);
  }

  public setZeroDriftCompliant(compliant: boolean | number): void {
    const value = typeof compliant === 'boolean' ? (compliant ? 1 : 0) : compliant > 0 ? 1 : 0;
    this.zeroDriftCompliant.set(value);
  }

  public incrementQueueShed(urgency = 'LOW', count = 1): void {
    this.queueShedTotal.inc({ urgency }, Math.max(1, count));
  }

  public updateFromSnapshot(snapshot: DeskTelemetrySnapshot): void {
    if (snapshot.allocatedCapital) {
      for (const [engine, amount] of Object.entries(snapshot.allocatedCapital)) {
        this.setEngineAllocatedCapital(engine, amount);
      }
    }
    if (snapshot.queueDepth !== undefined) {
      this.setPriorityQueueDepth(snapshot.queueDepth);
    }
    if (snapshot.fillRate !== undefined) {
      this.setOrdersFillRate(snapshot.fillRate);
    }
    if (snapshot.realizedSlippageBps !== undefined) {
      this.setRealizedSlippageBps(snapshot.realizedSlippageBps);
    }
    if (snapshot.circuitBreakerTier !== undefined) {
      this.setCircuitBreakerTier(snapshot.circuitBreakerTier);
    }
    if (snapshot.driftUsd !== undefined) {
      this.setAccountingDriftUsd(snapshot.driftUsd);
    }
  }

  public async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }

  public getContentType(): string {
    return this.registry.contentType;
  }

  public reset(): void {
    this.registry.resetMetrics();
  }
}
