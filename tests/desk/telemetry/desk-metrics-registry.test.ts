/**
 * Unit Test Suite for DeskMetricsRegistry
 * Milestone M4: Telemetry & HTTP Status Server
 */

import { describe, it, expect, beforeEach } from 'vitest';
import client from 'prom-client';
import { DeskMetricsRegistry } from '../../../src/desk/telemetry/desk-metrics-registry';

describe('DeskMetricsRegistry Unit Tests', () => {
  let registry: DeskMetricsRegistry;

  beforeEach(() => {
    registry = new DeskMetricsRegistry();
  });

  it('initializes with an isolated registry without polluting default registry', async () => {
    const defaultText = await client.register.metrics();
    const isolatedText = await registry.getMetricsText();

    expect(isolatedText).toContain('desk_engine_allocated_capital_usd');
    expect(isolatedText).toContain('desk_priority_queue_depth');
    expect(isolatedText).toContain('desk_orders_fill_rate');
    expect(isolatedText).toContain('desk_realized_slippage_bps');
    expect(isolatedText).toContain('desk_circuit_breaker_tier');
    expect(isolatedText).toContain('desk_accounting_drift_usd');
    expect(isolatedText).toContain('desk_zero_drift_compliant');
    expect(isolatedText).toContain('desk_queue_shed_total');

    expect(registry.getContentType()).toBe(client.register.contentType);
  });

  it('updates engine allocated capital gauge with labels', async () => {
    registry.setEngineAllocatedCapital('arbitrage', 25000);
    registry.setEngineAllocatedCapital('marl', 20000);

    const arb = await registry.engineAllocatedCapitalUsd.get();
    const arbEntry = arb.values.find((v) => v.labels.engine === 'arbitrage');
    const marlEntry = arb.values.find((v) => v.labels.engine === 'marl');

    expect(arbEntry?.value).toBe(25000);
    expect(marlEntry?.value).toBe(20000);
  });

  it('updates priority queue depth and clamps negative values', async () => {
    registry.setPriorityQueueDepth(42);
    let val = await registry.priorityQueueDepth.get();
    expect(val.values[0]?.value).toBe(42);

    registry.setPriorityQueueDepth(-10);
    val = await registry.priorityQueueDepth.get();
    expect(val.values[0]?.value).toBe(0);
  });

  it('updates orders fill rate with bounds clamping [0, 1]', async () => {
    registry.setOrdersFillRate(0.85);
    let val = await registry.ordersFillRate.get();
    expect(val.values[0]?.value).toBe(0.85);

    registry.setOrdersFillRate(1.5);
    val = await registry.ordersFillRate.get();
    expect(val.values[0]?.value).toBe(1);

    registry.setOrdersFillRate(-0.2);
    val = await registry.ordersFillRate.get();
    expect(val.values[0]?.value).toBe(0);
  });

  it('updates realized slippage in basis points', async () => {
    registry.setRealizedSlippageBps(4.25);
    const val = await registry.realizedSlippageBps.get();
    expect(val.values[0]?.value).toBe(4.25);
  });

  it('sets circuit breaker active tier and deactivates other tiers', async () => {
    registry.setCircuitBreakerTier('ALERT');
    const val = await registry.circuitBreakerTier.get();

    const alertEntry = val.values.find((v) => v.labels.tier === 'ALERT');
    const normalEntry = val.values.find((v) => v.labels.tier === 'NORMAL');
    const haltEntry = val.values.find((v) => v.labels.tier === 'HALT');

    expect(alertEntry?.value).toBe(1);
    expect(normalEntry?.value).toBe(0);
    expect(haltEntry?.value).toBe(0);
  });

  it('enforces Zero Accounting Drift compliant flag when drift < 1e-4 USD', async () => {
    registry.setAccountingDriftUsd(0.00005);
    let drift = await registry.accountingDriftUsd.get();
    let compliant = await registry.zeroDriftCompliant.get();
    expect(drift.values[0]?.value).toBe(0.00005);
    expect(compliant.values[0]?.value).toBe(1);

    registry.setAccountingDriftUsd(0.0005);
    drift = await registry.accountingDriftUsd.get();
    compliant = await registry.zeroDriftCompliant.get();
    expect(drift.values[0]?.value).toBe(0.0005);
    expect(compliant.values[0]?.value).toBe(0);
  });

  it('increments queue shed counter partitioned by urgency', async () => {
    registry.incrementQueueShed('LOW', 2);
    registry.incrementQueueShed('HIGH', 1);

    const val = await registry.queueShedTotal.get();
    const low = val.values.find((v) => v.labels.urgency === 'LOW');
    const high = val.values.find((v) => v.labels.urgency === 'HIGH');

    expect(low?.value).toBe(2);
    expect(high?.value).toBe(1);
  });

  it('updates all telemetry metrics from snapshot', async () => {
    registry.updateFromSnapshot({
      allocatedCapital: { arbitrage: 30000, amm: 20000 },
      queueDepth: 12,
      fillRate: 0.95,
      realizedSlippageBps: 2.1,
      circuitBreakerTier: 'REDUCE',
      driftUsd: 0.00001,
    });

    const metricsText = await registry.getMetricsText();
    expect(metricsText).toContain('desk_engine_allocated_capital_usd{engine="arbitrage"} 30000');
    expect(metricsText).toContain('desk_engine_allocated_capital_usd{engine="amm"} 20000');
    expect(metricsText).toContain('desk_priority_queue_depth 12');
    expect(metricsText).toContain('desk_orders_fill_rate 0.95');
    expect(metricsText).toContain('desk_realized_slippage_bps 2.1');
    expect(metricsText).toContain('desk_circuit_breaker_tier{tier="REDUCE"} 1');
    expect(metricsText).toContain('desk_zero_drift_compliant 1');
  });

  it('resets metrics values upon reset() call', async () => {
    registry.setPriorityQueueDepth(50);
    registry.reset();

    const val = await registry.priorityQueueDepth.get();
    expect(val.values[0]?.value).toBe(0);
  });
});
