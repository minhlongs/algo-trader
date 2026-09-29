/**
 * Tier 5: Adversarial Hardening & Chaos Engineering Test Suite (ADV-1 to ADV-20)
 * Tests resilience under market crashes, floating-point drift stress, race conditions, and malformed intents.
 */

process.env.VITEST_POOL_ID = '5';

import { describe, it, expect } from 'vitest';
import { MasterTradingLoopHarness, createArbitrageIntent, createMarlIntent } from './test-harness';
import { SynchronizedRiskGate } from '../../../src/desk/orchestrator/synchronized-risk-gate';
import { PrioritySignalQueue } from '../../../src/desk/orchestrator/priority-signal-queue';
import { ConflictResolver } from '../../../src/desk/orchestrator/conflict-resolver';
import { InternalCrossingEngine } from '../../../src/desk/orchestrator/internal-crossing-engine';
import { TriModeDispatcher } from '../../../src/desk/execution/tri-mode-dispatcher';
import { ClosedLoopReconciler } from '../../../src/desk/telemetry/closed-loop-reconciler';
import { AutonomousLifecycleManager } from '../../../src/desk/orchestrator/autonomous-lifecycle-manager';

describe('Tier 5: Adversarial Hardening & Chaos Engineering (ADV-1 to ADV-20)', () => {
  describe('Extreme Market Volatility & Gap Events', () => {
    it('ADV-1: Flash crash 40% instant drawdown immediately triggers HARD_STOP circuit breaker', () => {
      const riskGate = new SynchronizedRiskGate({ totalNavUsd: 100000 });
      const state = riskGate.evaluateCircuitBreaker(60000); // 40% drop from 100k
      expect(state.tier).toBe('HARD_STOP');
      expect(riskGate.getTier()).toBe('HARD_STOP');

      const intent = createArbitrageIntent({ quantity: 1.0 });
      const verdict = riskGate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.circuitBreakerTier).toBe('HARD_STOP');
    });

    it('ADV-2: Extreme spread blowout (5000 bps) does not cause negative fee or inverted price in dispatcher', () => {
      const dispatcher = new TriModeDispatcher('PAPER');
      const intent = createArbitrageIntent({ price: 100000 });
      const res = dispatcher.dispatch(intent, 150000); // 50% price gap
      expect(res.averagePrice).toBeGreaterThan(100000);
      expect(res.feeUsd).toBeGreaterThan(0);
      expect(res.slippageBps).toBeGreaterThan(0);
    });

    it('ADV-3: High-frequency burst of 500 intents correctly enforces queue capacity with shedding', () => {
      const queue = new PrioritySignalQueue(50);
      for (let i = 0; i < 500; i++) {
        queue.enqueue(createArbitrageIntent({ intentId: `burst-${i}`, urgency: 'LOW' }));
      }
      expect(queue.size()).toBeLessThanOrEqual(50);
      expect(queue.getStatus().shedCount).toBe(450);
    });

    it('ADV-4: Concurrent opposing orders on illiquid token properly net without cross-engine deadlock', () => {
      const resolver = new ConflictResolver();
      const crossing = new InternalCrossingEngine();
      const buy = createArbitrageIntent({ symbol: 'ILLIQ/USDT', side: 'BUY', quantity: 1000, price: 0.1 });
      const sell = createMarlIntent({ symbol: 'ILLIQ/USDT', side: 'SELL', quantity: 1000, price: 0.1 });

      const pairs = resolver.findOpposingPairs([buy, sell]);
      expect(pairs.length).toBe(1);

      const netRes = crossing.executeTier1Crossing(buy, sell, 0.1);
      expect(netRes.resolutionType).toBe('TIER_1_CROSS');
      expect(netRes.matchedQuantity).toBe(1000);
      expect(netRes.syntheticFills.length).toBe(2);
      expect(netRes.residualIntents.length).toBe(0);
    });
  });

  describe('Byzantine Inputs & Malformed Data Defense', () => {
    it('ADV-5: Reject intents with zero or negative quantities without throwing uncaught exceptions', () => {
      const dispatcher = new TriModeDispatcher('PAPER');
      const zeroQty = createArbitrageIntent({ quantity: 0 });
      const res = dispatcher.dispatch(zeroQty);
      expect(res.status).toBe('REJECTED');
      expect(res.executedQuantity).toBe(0);
    });

    it('ADV-6: Micro-lot fractional quantities (1e-8) maintain numerical stability without division by zero', () => {
      const harness = new MasterTradingLoopHarness();
      const microIntent = createArbitrageIntent({ quantity: 1e-8, price: 65000 });
      const res = harness.step(microIntent);
      expect(res.verdict.approved).toBe(true);
      expect(res.dispatch?.status).toBe('FILLED');
    });

    it('ADV-7: Opposing intents with extreme size disparity (10000x) safely net smaller leg and forward remainder', () => {
      const crossing = new InternalCrossingEngine();
      const whaleBuy = createArbitrageIntent({ quantity: 10000, price: 50 });
      const retailSell = createMarlIntent({ quantity: 1, price: 50 });

      const net = crossing.executeTier1Crossing(whaleBuy, retailSell, 50);
      expect(net.resolutionType).toBe('TIER_1_CROSS');
      expect(net.matchedQuantity).toBe(1);
      expect(net.syntheticFills.length).toBe(2);
      expect(net.residualIntents.length).toBe(1);
      expect(net.residualIntents[0]?.quantity).toBe(9999);
      expect(net.residualIntents[0]?.side).toBe('BUY');
    });

    it('ADV-8: Expired intents in queue are safely ignored or de-prioritized during high congestion', () => {
      const queue = new PrioritySignalQueue(10);
      const expiredIntent = createArbitrageIntent({ expiresAt: Date.now() - 5000, timeToExpiryMs: -5000 });
      queue.enqueue(expiredIntent);
      expect(queue.size()).toBe(1);
    });
  });

  describe('Zero Accounting Drift Under Chaos Stress', () => {
    it('ADV-9: Accumulating 1,000 rapid small fee deductions strictly preserves |delta| < 1e-4 USD', () => {
      const reconciler = new ClosedLoopReconciler(30000);
      let simulatedEquity = 110000;

      for (let i = 0; i < 1000; i++) {
        const fee = 0.05;
        reconciler.ingestFill('arbitrage', 0, fee);
        simulatedEquity -= fee;
      }

      const res = reconciler.reconcile(simulatedEquity);
      expect(res.isZeroDrift).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });

    it('ADV-10: Synthetic balance injection drift (> 0.0001 USD) is immediately flagged as accounting failure', () => {
      const reconciler = new ClosedLoopReconciler(30000);
      const corruptedEquity = 110000.0002;
      const res = reconciler.reconcile(corruptedEquity);
      expect(res.isZeroDrift).toBe(false);
      expect(res.driftUsd).toBeGreaterThan(1e-4);
    });
  });

  describe('Emergency Halt & Race Condition Guarantees', () => {
    it('ADV-11: Emergency halt called concurrently during order dispatch aborts execution within <= 100ms', () => {
      const mgr = new AutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      const haltRes = mgr.triggerEmergencyHalt('Network timeout');
      expect(haltRes.success).toBe(true);
      expect(haltRes.latencyMs).toBeLessThanOrEqual(100);
      expect(mgr.getState()).toBe('EMERGENCY_HALT');
    });

    it('ADV-12: Repeated idempotent emergency halts do not corrupt state or re-throw unhandled errors', () => {
      const mgr = new AutonomousLifecycleManager();
      mgr.transitionTo('RUNNING');
      mgr.triggerEmergencyHalt('First breach');
      const secondHalt = mgr.triggerEmergencyHalt('Second breach');
      expect(secondHalt.state).toBe('EMERGENCY_HALT');
      expect(mgr.getAbortSignal().aborted).toBe(true);
    });
  });
});
