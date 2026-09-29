/**
 * Tier 2: Telemetry, Accounting & Lifecycle Boundary Helper
 * Sub-100ms halt timing, 1e-4 USD drift tolerance, FSM state boundaries (10 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  MockTelemetryHub,
  MockAutonomousLifecycleManager,
} from '../fixtures/mock-telemetry-lifecycle.fixture';

export function registerTier2TelemetryLifecycleBoundaryTests(): void {
  describe('Zero-Drift Accounting Precision Boundaries', () => {
    it('B38: Drift of 0.999e-4 USD (< 1e-4) passes zero-drift verification', () => {
      const hub = new MockTelemetryHub();
      // Base expected is 100,000. Actual = 100,000.0000999 (0.999e-4)
      const res = hub.verifyZeroDrift(100000.0000999);
      expect(res.isZeroDrift).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });

    it('B39: Drift of 1.001e-4 USD (>= 1e-4) fails zero-drift verification', () => {
      const hub = new MockTelemetryHub();
      const res = hub.verifyZeroDrift(100000.0001001);
      expect(res.isZeroDrift).toBe(false);
      expect(res.driftUsd).toBeGreaterThanOrEqual(1e-4);
    });

    it('B40: Exact 0.0 USD drift has zero error', () => {
      const hub = new MockTelemetryHub();
      const res = hub.verifyZeroDrift(100000.0);
      expect(res.isZeroDrift).toBe(true);
      expect(res.driftUsd).toBe(0);
    });

    it('B41: Cumulative precision over 1,000 micro-fills maintains numerical stability', () => {
      const hub = new MockTelemetryHub();
      const microPnl = 0.01;
      const microFee = 0.001;
      const netPerFill = 0.009;

      for (let i = 0; i < 1000; i++) {
        hub.ingestFill('arbitrage', microPnl, microFee);
      }

      // Expected change = 1000 * 0.009 = 9.00 USD
      const res = hub.verifyZeroDrift(100009.0);
      expect(res.isZeroDrift).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });
  });

  describe('Lifecycle State Machine & Emergency Halt Boundaries', () => {
    it('B42: Emergency halt abort completes strictly in <= 100ms (typically < 5ms)', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');

      const haltResult = mgr.triggerEmergencyHalt('Breaker trip');
      expect(haltResult.success).toBe(true);
      expect(haltResult.latencyMs).toBeLessThanOrEqual(100);
      expect(haltResult.state).toBe('EMERGENCY_HALT');
    });

    it('B43: Direct transition from EMERGENCY_HALT to RUNNING is rejected (must go to INITIALIZING first)', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      mgr.triggerEmergencyHalt();

      expect(mgr.transitionTo('RUNNING')).toBe(false);
      expect(mgr.getState()).toBe('EMERGENCY_HALT');

      // Valid recovery path:
      expect(mgr.transitionTo('INITIALIZING')).toBe(true);
      expect(mgr.transitionTo('RUNNING')).toBe(true);
      expect(mgr.getState()).toBe('RUNNING');
    });

    it('B44: Direct transition from INITIALIZING to PAUSED is rejected', () => {
      const mgr = new MockAutonomousLifecycleManager();
      expect(mgr.transitionTo('PAUSED')).toBe(false);
      expect(mgr.getState()).toBe('INITIALIZING');
    });

    it('B45: Direct transition from STOPPED to PAUSED is rejected', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      mgr.transitionTo('STOPPED');
      expect(mgr.transitionTo('PAUSED')).toBe(false);
      expect(mgr.getState()).toBe('STOPPED');
    });

    it('B46: Multiple consecutive emergency halts are idempotent', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      const h1 = mgr.triggerEmergencyHalt('First trip');
      const h2 = mgr.triggerEmergencyHalt('Second trip');

      expect(h1.state).toBe('EMERGENCY_HALT');
      expect(h2.state).toBe('EMERGENCY_HALT');
      expect(mgr.getAbortSignal().aborted).toBe(true);
    });

    it('B47: High event throughput (500 events) emits without queue overflow', () => {
      const hub = new MockTelemetryHub();
      for (let i = 0; i < 500; i++) {
        hub.emitEvent({
          eventType: 'SUBMITTED',
          orderId: `ord-${i}`,
          intentId: `int-${i}`,
          engineId: 'arbitrage',
          venue: 'binance',
          mode: 'PAPER',
          quantity: 1.0,
        });
      }
      expect(hub.getEvents().length).toBe(500);
      expect(hub.getMetricCounters()['SUBMITTED']).toBe(500);
    });
  });
}
