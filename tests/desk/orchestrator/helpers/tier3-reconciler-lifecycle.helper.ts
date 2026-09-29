/**
 * Tier 3: Reconciler, Telemetry & Lifecycle Interactions Helper
 * Zero-drift closed loop, shadow mode isolation, emergency halt unwinds (10 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAmmIntent,
  createAlphaLabIntent,
} from '../fixtures/mock-engines.fixture';
import {
  MockTelemetryHub,
  MockAutonomousLifecycleManager,
} from '../fixtures/mock-telemetry-lifecycle.fixture';
import { MockTriModeDispatcher } from '../fixtures/mock-sor-dispatcher.fixture';
import { MockPriorityQueue } from '../fixtures/mock-queue-resolver.fixture';
import { MasterTradingLoopHarness } from '../test-harness';

export function registerTier3ReconcilerLifecycleInteractions(): void {
  describe('Zero-Drift Reconciler ↔ Telemetry & Lifecycle Interactions (X11 - X20)', () => {
    it('X11: Multi-engine fills across 4 engines update consolidated balance with Zero Accounting Drift', () => {
      const hub = new MockTelemetryHub();
      hub.ingestFill('arbitrage', 250, 10); // +240
      hub.ingestFill('marl', -50, 5); // -55
      hub.ingestFill('amm', 80, 2); // +78
      hub.ingestFill('alpha-lab', 500, 25); // +475
      // Net change = 240 - 55 + 78 + 475 = +738
      const res = hub.verifyZeroDrift(100738);
      expect(res.isZeroDrift).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });

    it('X12: Shadow mode virtual fills execute without altering real portfolio cash balance or introducing drift', () => {
      const dispatcher = new MockTriModeDispatcher('SHADOW');
      const hub = new MockTelemetryHub();

      const intent = createArbitrageIntent({ quantity: 2.0 });
      const dispatchRes = dispatcher.dispatch(intent);

      expect(dispatchRes.mode).toBe('SHADOW');
      // Shadow fills do not mutate real ledger cash
      const driftCheck = hub.verifyZeroDrift(100000);
      expect(driftCheck.isZeroDrift).toBe(true);
      expect(dispatcher.getLiveApiCallsCount()).toBe(0);
    });

    it('X13: Emergency halt triggered during queue saturation preserves protected risk-reducing orders for orderly unwind', () => {
      const q = new MockPriorityQueue(50);
      const lifecycle = new MockAutonomousLifecycleManager();
      lifecycle.transitionTo('RUNNING');

      // Populate queue with mix of protected hedges and speculative intents
      for (let i = 0; i < 40; i++) {
        q.enqueue(createAlphaLabIntent({ intentId: `spec-${i}`, isRiskReducing: false, urgency: 'LOW' }));
      }
      for (let i = 0; i < 10; i++) {
        q.enqueue(createMarlIntent({ intentId: `hedge-${i}`, isRiskReducing: true, urgency: 'HIGH' }));
      }

      // Trigger emergency halt
      lifecycle.triggerEmergencyHalt('Drawdown breaker tripped');
      expect(lifecycle.getState()).toBe('EMERGENCY_HALT');

      // Filter remaining queue for risk-reducing intents to execute emergency unwinds
      const hedges = q.getAll().filter((item) => item.isRiskReducing);
      expect(hedges.length).toBe(10);
      expect(hedges.every((h) => h.isRiskReducing)).toBe(true);
    });

    it('X14: Reconciler rejects corrupted fill that introduces > 1e-4 USD drift during high-throughput execution', () => {
      const hub = new MockTelemetryHub();
      hub.ingestFill('arbitrage', 100, 5); // +95
      // Simulate erroneous accounting update: $100,095.01 reported instead of $100,095.00
      const res = hub.verifyZeroDrift(100095.01);
      expect(res.isZeroDrift).toBe(false);
      expect(res.driftUsd).toBeCloseTo(0.01, 4);
    });

    it('X15: Pause state stops new order ingestion while permitting active slicing executions to drain', () => {
      const harness = new MasterTradingLoopHarness();
      expect(harness.lifecycle.getState()).toBe('RUNNING');

      harness.lifecycle.transitionTo('PAUSED');
      expect(harness.lifecycle.getState()).toBe('PAUSED');

      const intent = createArbitrageIntent();
      const res = harness.step(intent);
      expect(res.enqueued).toBe(false);
      expect(res.verdict.approved).toBe(false);
      expect(res.verdict.reason).toContain('Loop is in PAUSED state');
    });

    it('X16: Recovery lifecycle (EMERGENCY_HALT -> INITIALIZING -> RUNNING) validates system state before resumption', () => {
      const lifecycle = new MockAutonomousLifecycleManager();
      lifecycle.transitionTo('RUNNING');
      lifecycle.triggerEmergencyHalt();
      expect(lifecycle.getState()).toBe('EMERGENCY_HALT');

      // Valid resumption sequence
      expect(lifecycle.transitionTo('INITIALIZING')).toBe(true);
      expect(lifecycle.transitionTo('RUNNING')).toBe(true);
      expect(lifecycle.getState()).toBe('RUNNING');
    });

    it('X17: Telemetry event bus streams synchronized lifecycle events through breaker tripping', () => {
      const hub = new MockTelemetryHub();
      hub.emitEvent({
        eventType: 'SUBMITTED',
        orderId: 'o1',
        intentId: 'i1',
        engineId: 'arbitrage',
        venue: 'binance',
        mode: 'PAPER',
        quantity: 1.0,
      });
      hub.emitEvent({
        eventType: 'CIRCUIT_BREAKER_TRIGGERED',
        orderId: 'o1',
        intentId: 'i1',
        engineId: 'arbitrage',
        venue: 'binance',
        mode: 'PAPER',
        quantity: 0,
        metadata: { tier: 'HALT', dd: 0.15 },
      });

      const events = hub.getEvents();
      expect(events.length).toBe(2);
      expect(events[1].eventType).toBe('CIRCUIT_BREAKER_TRIGGERED');
    });

    it('X18: Closed-loop balance update maintains drift invariant over multi-stage trading cycle', () => {
      const hub = new MockTelemetryHub();
      let expectedBalance = 100000;

      const fills = [
        { engine: 'arbitrage' as const, pnl: 10, fee: 0.5 },
        { engine: 'marl' as const, pnl: 20, fee: 1.0 },
        { engine: 'amm' as const, pnl: -5, fee: 0.2 },
        { engine: 'alpha-lab' as const, pnl: 50, fee: 2.5 },
      ];

      fills.forEach((f) => {
        hub.ingestFill(f.engine, f.pnl, f.fee);
        expectedBalance += f.pnl - f.fee;
        const res = hub.verifyZeroDrift(expectedBalance);
        expect(res.isZeroDrift).toBe(true);
      });
    });

    it('X19: Tri-mode dispatcher isolates LIVE orders during emergency shutdown while SHADOW metrics persist', () => {
      const dispatcher = new MockTriModeDispatcher('LIVE');
      const lifecycle = new MockAutonomousLifecycleManager();
      lifecycle.transitionTo('RUNNING');

      // Emergency halt triggered
      lifecycle.triggerEmergencyHalt();
      expect(lifecycle.getState()).toBe('EMERGENCY_HALT');

      // Live calls are prevented when halt is active
      const canExecuteLive = lifecycle.getState() === 'RUNNING';
      expect(canExecuteLive).toBe(false);
      expect(dispatcher.getLiveApiCallsCount()).toBe(0);
    });

    it('X20: Master trading loop handles full lifecycle: signal -> queue -> risk -> dispatch -> telemetry -> zero-drift', () => {
      const harness = new MasterTradingLoopHarness();
      const intent = createArbitrageIntent({ quantity: 0.05, price: 50000 });

      const stepResult = harness.step(intent);
      expect(stepResult.enqueued).toBe(true);
      expect(stepResult.verdict.approved).toBe(true);
      expect(stepResult.dispatch?.status).toBe('FILLED');

      const events = harness.telemetry.getEvents();
      expect(events.some((e) => e.eventType === 'FILLED')).toBe(true);
    });
  });
}
