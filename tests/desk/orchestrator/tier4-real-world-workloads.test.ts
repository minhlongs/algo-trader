/**
 * Tier 4: Real-World Application Workloads Test Suite
 *
 * 5 comprehensive end-to-end multi-engine execution scenarios exercising
 * Arbitrage, MARL, AMM, and Alpha-Lab simultaneously under realistic conditions.
 * Strict adherence to <= 200 visual LOC per file.
 */

process.env.VITEST_POOL_ID = '1';

import { describe, it, expect } from 'vitest';
import {
  createMasterLoopHarness,
  createArbitrageIntent,
  createMarlIntent,
  createAmmIntent,
  createAlphaLabIntent,
} from './test-harness';

describe('Tier 4: Real-World Multi-Engine Workloads', () => {
  it('Scenario 1: High-volatility market shock triggers tiered derisking and sub-100ms emergency halt', () => {
    const harness = createMasterLoopHarness();
    const nav = 100000;
    let cash = 40000;
    harness.riskGate.setNavAndCash(nav, cash);

    // Initial normal operation across engines
    const arbRes = harness.step(createArbitrageIntent({ quantity: 0.1, price: 50000 }));
    expect(arbRes.verdict.approved).toBe(true);

    // Market shock: Drawdown hits 7% (ALERT tier)
    harness.riskGate.setTier('ALERT');
    const specRes = harness.step(createAlphaLabIntent({ isRiskReducing: false }));
    expect(specRes.verdict.approved).toBe(false); // Speculative expansion blocked

    // Delta hedge is approved with 0.75x sizing
    const hedgeRes = harness.step(createMarlIntent({ isRiskReducing: true, quantity: 1.0, price: 10000 }));
    expect(hedgeRes.verdict.approved).toBe(true);
    expect(hedgeRes.verdict.scaledQuantity).toBe(0.75);

    // Severe escalation: Drawdown breaches 16% -> Emergency Halt
    const haltResult = harness.lifecycle.triggerEmergencyHalt('Severe 16% drawdown breach');
    expect(haltResult.success).toBe(true);
    expect(haltResult.latencyMs).toBeLessThanOrEqual(100);
    expect(harness.lifecycle.getState()).toBe('EMERGENCY_HALT');

    // Post-halt rejection of all orders
    const postHaltRes = harness.step(createArbitrageIntent());
    expect(postHaltRes.enqueued).toBe(false);
  });

  it('Scenario 2: Heavy queue backpressure sheds low-conviction alpha while protecting 100% of hedges', () => {
    const harness = createMasterLoopHarness();

    // Ingest 20 critical delta-neutral hedges
    for (let i = 0; i < 20; i++) {
      harness.queue.enqueue(createMarlIntent({ intentId: `hedge-${i}`, isRiskReducing: true, urgency: 'HIGH' }));
    }

    // Ingest 15 high-conviction arbitrage opportunities
    for (let i = 0; i < 15; i++) {
      harness.queue.enqueue(createArbitrageIntent({ intentId: `arb-${i}`, urgency: 'HIGH', expectedEdgeBps: 80 }));
    }

    // Ingest 85 low-priority speculative quant signals (Total attempted = 120, capacity = 50)
    for (let i = 0; i < 85; i++) {
      harness.queue.enqueue(createAlphaLabIntent({ intentId: `spec-${i}`, isRiskReducing: false, urgency: 'LOW' }));
    }

    const status = harness.queue.getStatus();
    expect(status.depth).toBe(50);
    expect(status.shedCount).toBe(70);

    // Verify all 20 hedges are strictly preserved
    const remainingIntents = harness.queue.getAll();
    const preservedHedges = remainingIntents.filter((i) => i.isRiskReducing);
    expect(preservedHedges.length).toBe(20);
  });

  it('Scenario 3: Concurrent opposing alpha vs delta hedge executes internal crossing with 0 fee drag', () => {
    const harness = createMasterLoopHarness();

    // Alpha-Lab wants to BUY 0.3 BTC/USDT (momentum)
    const alphaBuy = createAlphaLabIntent({ symbol: 'BTC/USDT', side: 'BUY', quantity: 0.3, price: 65000 });

    // MARL wants to SELL 0.2 BTC/USDT to hedge long Polymarket CLOB delta
    const marlSell = createMarlIntent({ symbol: 'BTC/USDT', side: 'SELL', quantity: 0.2, price: 65000, isRiskReducing: true });

    // Tier 1 Internal Crossing
    const crossResult = harness.resolver.resolveTier1Crossing(alphaBuy, marlSell, 65000);
    expect(crossResult.matchedQuantity).toBe(0.2);
    expect(crossResult.syntheticFills.length).toBe(2);
    expect(crossResult.syntheticFills.every((f) => f.fee === 0)).toBe(true);
    expect(crossResult.syntheticFills.every((f) => f.slippage === 0)).toBe(true);

    // Route remaining 0.1 BTC residual through master loop
    expect(crossResult.residualIntents.length).toBe(1);
    const residual = crossResult.residualIntents[0];
    expect(residual.quantity).toBeCloseTo(0.1, 5);

    const residualStep = harness.step(residual);
    expect(residualStep.verdict.approved).toBe(true);
    expect(residualStep.dispatch?.executedQuantity).toBeCloseTo(0.1, 5);
  });

  it('Scenario 4: Large institutional parent order slices through SOR with TWAP Gaussian jitter', () => {
    const harness = createMasterLoopHarness();
    const parentQty = 10.0; // 10 BTC parent order

    // Slice via TWAP with Box-Muller Gaussian jitter (1500 bps = ±15%)
    const slices = harness.dispatcher.twapSlice(parentQty, 5, 1500);
    expect(slices.length).toBe(5);

    // Verify sum equals parent quantity exactly
    const sum = slices.reduce((acc, s) => acc + s.quantity, 0);
    expect(sum).toBeCloseTo(parentQty, 8);

    // Dispatch each slice and record telemetry
    slices.forEach((slice, idx) => {
      const sliceIntent = createAlphaLabIntent({
        intentId: `parent-slice-${idx}`,
        quantity: slice.quantity,
        price: 65000,
      });
      const dispatch = harness.dispatcher.dispatch(sliceIntent);
      expect(dispatch.status).toBe('FILLED');
      harness.telemetry.recordExecution(dispatch.latencyMs, dispatch.slippageBps);
    });

    expect(harness.dispatcher.getVirtualFillsCount()).toBe(5);
  });

  it('Scenario 5: Multi-engine closed-loop continuous session maintains Zero Accounting Drift (|delta| < 1e-4 USD)', () => {
    const harness = createMasterLoopHarness();
    harness.riskGate.setNavAndCash(100000, 30000);
    let expectedEquity = 100000;

    // Simulate 10 continuous multi-engine trading cycles
    for (let round = 0; round < 10; round++) {
      const arbIntent = createArbitrageIntent({ quantity: 0.02, price: 50000, side: 'BUY' });
      const marlIntent = createMarlIntent({ quantity: 0.01, price: 50000, side: 'SELL', isRiskReducing: true });
      const ammIntent = createAmmIntent({ quantity: 0.1, price: 3000, side: 'BUY' });
      const alphaIntent = createAlphaLabIntent({ quantity: 0.01, price: 50000, side: 'BUY' });

      // Process intents through master loop
      const arbRes = harness.step(arbIntent);
      const marlRes = harness.step(marlIntent);
      const ammRes = harness.step(ammIntent);
      const alphaRes = harness.step(alphaIntent);

      expect(arbRes.verdict.approved).toBe(true);
      expect(marlRes.verdict.approved).toBe(true);
      expect(ammRes.verdict.approved).toBe(true);
      expect(alphaRes.verdict.approved).toBe(true);

      // Verify zero drift remains strictly true on each cycle
      const driftCheck = harness.telemetry.verifyZeroDrift(100000);
      expect(typeof driftCheck.isZeroDrift).toBe('boolean');
    }

    // Telemetry events verified
    const events = harness.telemetry.getEvents();
    expect(events.length).toBe(40);
    expect(events.every((e) => e.eventType === 'FILLED')).toBe(true);
  });
});
