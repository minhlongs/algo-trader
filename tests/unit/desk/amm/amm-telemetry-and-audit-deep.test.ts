/**
 * Deep unit tests for AmmMetricsRecorder and AmmAuditLogger
 * Covering 100% branch and edge case execution for telemetry & audit trails.
 */

import { describe, it, expect } from 'vitest';
import { AmmMetricsRecorder } from '../../../../src/desk/amm/telemetry/amm-metrics';
import { AmmAuditLogger } from '../../../../src/desk/amm/telemetry/amm-audit-logger';

describe('AmmMetricsRecorder Deep Branch Coverage', () => {
  it('records trade volume and arbitrage pnl with edge case values', () => {
    const recorder = new AmmMetricsRecorder();

    // Volume positive and negative clamping
    recorder.recordTrade(1500, 25.5);
    recorder.recordTrade(-500); // Math.max(0, -500) -> 0, pnl undefined

    const snap1 = recorder.getSnapshot();
    expect(snap1.tradeVolumeUsd).toBe(1500);
    expect(snap1.arbitragePnlUsd).toBe(25.5);

    // Liquidity depth and active pools clamping
    recorder.setLiquidityDepth(-100);
    recorder.setActivePoolsCount(-5);
    expect(recorder.getSnapshot().liquidityDepthUsd).toBe(0);
    expect(recorder.getSnapshot().activePoolsCount).toBe(0);

    recorder.setLiquidityDepth(50000);
    recorder.setActivePoolsCount(3);
    expect(recorder.getSnapshot().liquidityDepthUsd).toBe(50000);
    expect(recorder.getSnapshot().activePoolsCount).toBe(3);

    // VPIN toxicity clamping [0.0, 1.0]
    recorder.setVpinToxicity(-0.2);
    expect(recorder.getSnapshot().vpinToxicity).toBe(0);
    recorder.setVpinToxicity(1.5);
    expect(recorder.getSnapshot().vpinToxicity).toBe(1.0);
    recorder.setVpinToxicity(0.42);
    expect(recorder.getSnapshot().vpinToxicity).toBe(0.42);

    // Circuit breaker & tripwire activations
    recorder.setCircuitBreakerTripped(true);
    recorder.recordTripwireActivation();
    recorder.recordTripwireActivation();

    const snap2 = recorder.getSnapshot();
    expect(snap2.circuitBreakerTripped).toBe(true);
    expect(snap2.tripwireActivations).toBe(2);
  });

  it('exports valid Prometheus exposition format metrics', () => {
    const recorder = new AmmMetricsRecorder();
    recorder.setLiquidityDepth(12345.67);
    recorder.recordTrade(9876.54, 12.3456);
    recorder.setVpinToxicity(0.35);
    recorder.setCircuitBreakerTripped(false);
    recorder.setActivePoolsCount(4);

    const prom = recorder.exportPrometheusMetrics();
    expect(prom).toContain('amm_liquidity_depth_usd 12345.67');
    expect(prom).toContain('amm_trade_volume_usd 9876.54');
    expect(prom).toContain('amm_arbitrage_pnl_usd 12.3456');
    expect(prom).toContain('amm_vpin_toxicity 0.3500');
    expect(prom).toContain('amm_circuit_breaker_tripped 0');
    expect(prom).toContain('amm_active_pools_count 4');

    recorder.setCircuitBreakerTripped(true);
    expect(recorder.exportPrometheusMetrics()).toContain('amm_circuit_breaker_tripped 1');
  });
});

describe('AmmAuditLogger Deep Branch Coverage', () => {
  it('initializes with default and custom secret and returns empty chain verification', () => {
    const defaultLogger = new AmmAuditLogger();
    expect(defaultLogger.verifyChain()).toEqual({ valid: true, totalRecords: 0 });
    expect(defaultLogger.getChain()).toHaveLength(0);

    const customLogger = new AmmAuditLogger('custom-audit-secret');
    expect(customLogger.verifyChain()).toEqual({ valid: true, totalRecords: 0 });
  });

  it('records events in hash chain and verifies valid audit chain', () => {
    const logger = new AmmAuditLogger('test-secret');

    const rec1 = logger.logEvent('POOL_CREATED', { poolId: 'p-1', outcomes: 2 }, 'p-1');
    expect(rec1.index).toBe(0);
    expect(rec1.prevHash).toBe('0'.repeat(64));
    expect(rec1.hash.length).toBe(64);

    const rec2 = logger.logEvent('TRADE_EXECUTED', { notional: 100 }, 'p-1');
    expect(rec2.index).toBe(1);
    expect(rec2.prevHash).toBe(rec1.hash);

    const verify = logger.verifyChain();
    expect(verify.valid).toBe(true);
    expect(verify.totalRecords).toBe(2);
  });

  it('detects non-contiguous index tampering', () => {
    const logger = new AmmAuditLogger();
    logger.logEvent('POOL_CREATED', { poolId: 'p-1' });
    logger.logEvent('TRADE_EXECUTED', { notional: 50 });

    const chain = (logger as any).chain;
    chain[1].index = 5;

    const res = logger.verifyChain();
    expect(res.valid).toBe(false);
    expect(res.failedIndex).toBe(1);
    expect(res.reason).toContain('Non-contiguous sequence index');
  });

  it('detects previous hash mismatch tampering', () => {
    const logger = new AmmAuditLogger();
    logger.logEvent('POOL_CREATED', { poolId: 'p-1' });
    logger.logEvent('TRADE_EXECUTED', { notional: 50 });

    const chain = (logger as any).chain;
    chain[1].prevHash = 'corrupted_prev_hash';

    const res = logger.verifyChain();
    expect(res.valid).toBe(false);
    expect(res.failedIndex).toBe(1);
    expect(res.reason).toContain('prevHash mismatch');
  });

  it('detects payload modification hash corruption', () => {
    const logger = new AmmAuditLogger();
    logger.logEvent('POOL_CREATED', { poolId: 'p-1' });

    const chain = (logger as any).chain;
    chain[0].details = { poolId: 'tampered-pool-id' };

    const res = logger.verifyChain();
    expect(res.valid).toBe(false);
    expect(res.failedIndex).toBe(0);
    expect(res.reason).toContain('Cryptographic hash corruption');
  });

  it('detects non-monotonic timestamp anomalies', () => {
    const logger = new AmmAuditLogger();
    logger.logEvent('POOL_CREATED', { poolId: 'p-1' });
    logger.logEvent('TRADE_EXECUTED', { notional: 50 });

    const chain = (logger as any).chain;
    chain[1].timestamp = chain[0].timestamp - 1000;
    // Recompute hash for record 1 with the backwards timestamp so hash verification passes
    chain[1].hash = logger.computeRecordHash(
      chain[1].prevHash,
      chain[1].index,
      chain[1].timestamp,
      chain[1].action,
      chain[1].details
    );

    const res = logger.verifyChain();
    expect(res.valid).toBe(false);
    expect(res.failedIndex).toBe(1);
    expect(res.reason).toContain('Non-monotonic timestamp');
  });
});
