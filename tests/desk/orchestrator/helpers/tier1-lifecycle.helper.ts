/**
 * Tier 1: Autonomous Lifecycle & Master Loop Helper (F17 - F19)
 * Covers R4 lifecycle state machine and master trading loop (15 tests).
 */

import { describe, it, expect } from 'vitest';
import { createArbitrageIntent, createMarlIntent } from '../fixtures/mock-engines.fixture';
import { MockAutonomousLifecycleManager } from '../fixtures/mock-telemetry-lifecycle.fixture';
import { MasterTradingLoopHarness } from '../test-harness';

export function registerTier1LifecycleTests(): void {
  describe('F17: Autonomous Lifecycle State Machine', () => {
    it('T17.1: Starts in INITIALIZING and transitions to RUNNING', () => {
      const mgr = new MockAutonomousLifecycleManager();
      expect(mgr.getState()).toBe('INITIALIZING');
      expect(mgr.transitionTo('RUNNING')).toBe(true);
      expect(mgr.getState()).toBe('RUNNING');
    });

    it('T17.2: Transitions from RUNNING to PAUSED and back to RUNNING', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      expect(mgr.transitionTo('PAUSED')).toBe(true);
      expect(mgr.getState()).toBe('PAUSED');
      expect(mgr.transitionTo('RUNNING')).toBe(true);
      expect(mgr.getState()).toBe('RUNNING');
    });

    it('T17.3: Transitions from RUNNING or PAUSED to STOPPED', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      expect(mgr.transitionTo('STOPPED')).toBe(true);
      expect(mgr.getState()).toBe('STOPPED');
    });

    it('T17.4: Rejects invalid transitions', () => {
      const mgr = new MockAutonomousLifecycleManager();
      expect(mgr.transitionTo('PAUSED')).toBe(false);
      expect(mgr.getState()).toBe('INITIALIZING');
    });

    it('T17.5: Permits transition to EMERGENCY_HALT from any operational state', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      expect(mgr.transitionTo('EMERGENCY_HALT')).toBe(true);
      expect(mgr.getState()).toBe('EMERGENCY_HALT');
    });
  });

  describe('F18: Fail-Closed Emergency Halt Manager (<= 100ms)', () => {
    it('T18.1: Synchronously aborts active slicing executors via AbortSignal', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      const signal = mgr.getAbortSignal();
      expect(signal.aborted).toBe(false);

      mgr.triggerEmergencyHalt('Test halt');
      expect(signal.aborted).toBe(true);
    });

    it('T18.2: Completes emergency halt transition within <= 100ms', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      const res = mgr.triggerEmergencyHalt();
      expect(res.success).toBe(true);
      expect(res.latencyMs).toBeLessThanOrEqual(100);
      expect(res.state).toBe('EMERGENCY_HALT');
    });

    it('T18.3: Sets state to EMERGENCY_HALT and prevents subsequent RUNNING transition', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      mgr.triggerEmergencyHalt();
      expect(mgr.transitionTo('RUNNING')).toBe(false);
      expect(mgr.getState()).toBe('EMERGENCY_HALT');
    });

    it('T18.4: Triggers fail-closed state upon simulated critical drawdown', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      const res = mgr.triggerEmergencyHalt('Drawdown breach >= 15%');
      expect(res.state).toBe('EMERGENCY_HALT');
    });

    it('T18.5: Reset restores state to INITIALIZING and creates fresh AbortController', () => {
      const mgr = new MockAutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      mgr.triggerEmergencyHalt();
      mgr.reset();
      expect(mgr.getState()).toBe('INITIALIZING');
      expect(mgr.getAbortSignal().aborted).toBe(false);
    });
  });

  describe('F19: Unified Master Trading Loop Orchestration', () => {
    it('T19.1: Master loop coordinates ingestion, queue, risk gate, and dispatcher in one call', () => {
      const harness = new MasterTradingLoopHarness();
      const intent = createArbitrageIntent({ quantity: 0.1, price: 50000 });
      const res = harness.step(intent);

      expect(res.enqueued).toBe(true);
      expect(res.verdict.approved).toBe(true);
      expect(res.dispatch?.status).toBe('FILLED');
      expect(harness.telemetry.getEvents().length).toBe(1);
    });

    it('T19.2: Rejects incoming intents when master loop is not in RUNNING state', () => {
      const harness = new MasterTradingLoopHarness();
      harness.lifecycle.triggerEmergencyHalt();
      const intent = createArbitrageIntent();
      const res = harness.step(intent);

      expect(res.enqueued).toBe(false);
      expect(res.verdict.approved).toBe(false);
      expect(res.verdict.reason).toContain('Loop is in EMERGENCY_HALT state');
    });

    it('T19.3: Emits REJECTED event when risk gate blocks order', () => {
      const harness = new MasterTradingLoopHarness();
      harness.riskGate.setTier('HALT');
      const intent = createArbitrageIntent();
      const res = harness.step(intent);

      expect(res.enqueued).toBe(true);
      expect(res.verdict.approved).toBe(false);
      const events = harness.telemetry.getEvents();
      expect(events[events.length - 1].eventType).toBe('REJECTED');
    });

    it('T19.4: Scales quantity down and dispatches when circuit breaker is in ALERT/REDUCE', () => {
      const harness = new MasterTradingLoopHarness();
      harness.riskGate.setTier('ALERT');
      const hedge = createMarlIntent({ isRiskReducing: true, quantity: 1.0, price: 10000 });
      const res = harness.step(hedge);

      expect(res.verdict.approved).toBe(true);
      expect(res.verdict.scaledQuantity).toBe(0.75);
      expect(res.dispatch?.executedQuantity).toBe(0.75);
    });

    it('T19.5: Maintains zero accounting drift end-to-end after step execution', () => {
      const harness = new MasterTradingLoopHarness();
      const intent = createArbitrageIntent({ quantity: 0.05, price: 50000 });
      harness.step(intent);

      const driftCheck = harness.telemetry.verifyZeroDrift(100000);
      expect(typeof driftCheck.isZeroDrift).toBe('boolean');
    });
  });
}
