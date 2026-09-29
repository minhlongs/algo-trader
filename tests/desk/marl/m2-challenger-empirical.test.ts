/**
 * Empirical Challenger Test Suite for Milestone 2: Delta Tracking & Tolerance Hysteresis.
 *
 * Adversarial empirical stress testing for:
 * 1. Exact boundary conditions for tolerance threshold:
 *    - |Δ_net| = Δ_thresh strictly does NOT trigger rebalance.
 *    - |Δ_net| = Δ_thresh + 1e-6 MUST trigger rebalance.
 * 2. Hysteresis state retention and release:
 *    - Active rebalance state stays active when delta drops to Δ_inner + 1e-4.
 *    - Rebalance state terminates when delta reaches |Δ_net| <= Δ_inner.
 * 3. Extreme inventories and zero/negative scenarios:
 *    - Δ -> ±100,000 without numeric instability.
 *    - Sub-lot sizes (< minLotSize) with clean suppression.
 *    - Zero/near-zero equity edge cases and margin utilization safety clamp.
 * 4. 1,000-cycle rapid delta oscillation simulation:
 *    - Deterministic state machine transitions.
 *    - Zero state corruption.
 *    - Zero memory leaks / bounded collection sizes.
 *
 * Conforms to AGENTS.md Hard Rules: zero :any, zero console.log.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InventoryDeltaTracker,
  ToleranceBandRebalanceTrigger,
  DeltaNeutralCoordinator,
  DeltaTrackerConfigSchema,
  DeltaNeutralCoordinatorConfigSchema,
} from '../../../src/desk/marl/hedging';
import type { PortfolioDeltaSnapshot } from '../../../src/desk/marl/hedging';
import type {
  IExchangeConnector,
  ExchangeOrderParams,
  ExchangeOrderResult,
  ExchangeBalance,
  SupportedExchangeId,
} from '../../../src/desk/arbitrage/connectors/types';

class MockExchangeConnector implements IExchangeConnector {
  public exchangeId: SupportedExchangeId;
  public placeOrderCalls: ExchangeOrderParams[] = [];
  public balances: ExchangeBalance = {
    USDT: { free: 10_000_000, used: 0, total: 10_000_000 },
    BTC: { free: 500, used: 0, total: 500 },
  };

  constructor(exchangeId: SupportedExchangeId = 'binance') {
    this.exchangeId = exchangeId;
  }

  async placeOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResult> {
    this.placeOrderCalls.push(params);
    return {
      orderId: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      exchange: this.exchangeId,
      symbol: params.symbol,
      side: params.side,
      price: params.price ?? 50_000,
      amount: params.amount,
      filled: params.amount,
      remaining: 0,
      status: 'closed',
      timestamp: Date.now(),
    };
  }

  async cancelOrder(_orderId: string, _symbol: string): Promise<boolean> {
    return true;
  }

  async fetchOrder(orderId: string, symbol: string): Promise<ExchangeOrderResult> {
    return {
      orderId,
      exchange: this.exchangeId,
      symbol,
      side: 'buy',
      price: 50_000,
      amount: 1.0,
      filled: 1.0,
      remaining: 0,
      status: 'closed',
      timestamp: Date.now(),
    };
  }

  async fetchBalance(): Promise<ExchangeBalance> {
    return this.balances;
  }

  async getLatencyMs(): Promise<number> {
    return 10;
  }
}

describe('Challenger Empirical Stress Suite: M2 Delta Tracking & Tolerance Hysteresis', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 1: Exact Boundary Conditions for Tolerance Threshold
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('1. Exact Boundary Conditions for Tolerance Threshold', () => {
    const deltaThresh = 0.10;
    const eps = 1e-6;

    it('strictly does NOT trigger rebalance at exact positive boundary |Δ_net| = Δ_thresh (Trigger)', () => {
      const trigger = new ToleranceBandRebalanceTrigger(deltaThresh, 0.50);
      const res = trigger.evaluate(deltaThresh);

      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });

    it('strictly does NOT trigger rebalance at exact negative boundary |Δ_net| = -Δ_thresh (Trigger)', () => {
      const trigger = new ToleranceBandRebalanceTrigger(deltaThresh, 0.50);
      const res = trigger.evaluate(-deltaThresh);

      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });

    it('MUST trigger rebalance at |Δ_net| = Δ_thresh + 1e-6 for positive delta (Trigger)', () => {
      const trigger = new ToleranceBandRebalanceTrigger(deltaThresh, 0.50);
      const deltaWithEps = deltaThresh + eps; // 0.100001
      const res = trigger.evaluate(deltaWithEps);

      expect(res.triggerRebalance).toBe(true);
      expect(res.targetHedgeAmount).toBeCloseTo(-deltaWithEps, 6);
    });

    it('MUST trigger rebalance at |Δ_net| = -(Δ_thresh + 1e-6) for negative delta (Trigger)', () => {
      const trigger = new ToleranceBandRebalanceTrigger(deltaThresh, 0.50);
      const deltaWithEps = -(deltaThresh + eps); // -0.100001
      const res = trigger.evaluate(deltaWithEps);

      expect(res.triggerRebalance).toBe(true);
      expect(res.targetHedgeAmount).toBeCloseTo(-deltaWithEps, 6);
    });

    it('evaluates exact boundary on DeltaNeutralCoordinator.evaluateTolerance()', () => {
      const coordinator = new DeltaNeutralCoordinator({
        deltaThreshold: deltaThresh,
        hysteresisRatio: 0.50,
        minLotSize: 0.0001,
      });

      // Boundary: exact threshold -> NO rebalance
      const atBoundary = coordinator.evaluateTolerance(deltaThresh);
      expect(atBoundary.triggerRebalance).toBe(false);
      expect(atBoundary.targetHedgeAmount).toBe(0);

      // Boundary + 1e-6 -> MUST rebalance
      const aboveBoundary = coordinator.evaluateTolerance(deltaThresh + eps);
      expect(aboveBoundary.triggerRebalance).toBe(true);
      expect(aboveBoundary.targetHedgeAmount).toBeLessThan(0);
    });

    it('evaluates exact boundary on InventoryDeltaTracker with high precision config (roundingDecimals: 6)', () => {
      const tracker = new InventoryDeltaTracker({
        deltaThreshold: deltaThresh,
        roundingDecimals: 6,
      });

      // Exactly at threshold: 0.10
      tracker.updatePolymarketPosition('BTC-YES', deltaThresh, 1.0, 1.0);
      const snapExact = tracker.getSnapshot();
      expect(snapExact.netDelta).toBe(deltaThresh);
      expect(snapExact.rebalanceRequired).toBe(false);

      // Above threshold by 1e-6: 0.100001
      tracker.updatePolymarketPosition('BTC-YES', deltaThresh + eps, 1.0, 1.0);
      const snapAbove = tracker.getSnapshot();
      expect(snapAbove.netDelta).toBe(Number((deltaThresh + eps).toFixed(6)));
      expect(snapAbove.rebalanceRequired).toBe(true);
    });

    it('verifies sub-boundary delta Δ_thresh - 1e-6 strictly does not trigger', () => {
      const trigger = new ToleranceBandRebalanceTrigger(deltaThresh, 0.50);
      const res = trigger.evaluate(deltaThresh - eps);

      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 2: Hysteresis State Retention & Release
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('2. Hysteresis State Retention & Release', () => {
    const deltaThresh = 0.10;
    const hysteresisRatio = 0.50;
    const deltaInner = deltaThresh * hysteresisRatio; // 0.05
    let trigger: ToleranceBandRebalanceTrigger;

    beforeEach(() => {
      trigger = new ToleranceBandRebalanceTrigger(deltaThresh, hysteresisRatio);
    });

    it('retains active rebalance state when delta drops to Δ_inner + 1e-4', () => {
      // Step 1: Trigger breach
      const triggerRes = trigger.evaluate(0.12);
      expect(triggerRes.triggerRebalance).toBe(true);

      // Step 2: Drop delta to deltaInner + 1e-4 = 0.0501
      const deltaDrop = deltaInner + 1e-4;
      const retainRes = trigger.evaluate(deltaDrop);

      expect(retainRes.triggerRebalance).toBe(true);
      expect(retainRes.targetHedgeAmount).toBeCloseTo(-deltaDrop, 4);
    });

    it('retains active rebalance state for negative delta when dropping to -(Δ_inner + 1e-4)', () => {
      // Step 1: Trigger negative breach
      const triggerRes = trigger.evaluate(-0.15);
      expect(triggerRes.triggerRebalance).toBe(true);

      // Step 2: Drop delta to -(deltaInner + 1e-4) = -0.0501
      const deltaDrop = -(deltaInner + 1e-4);
      const retainRes = trigger.evaluate(deltaDrop);

      expect(retainRes.triggerRebalance).toBe(true);
      expect(retainRes.targetHedgeAmount).toBeCloseTo(-deltaDrop, 4);
    });

    it('terminates rebalance state when delta reaches exact inner boundary |Δ_net| = Δ_inner', () => {
      // Step 1: Trigger breach
      trigger.evaluate(0.14);

      // Step 2: Reach exact inner boundary: 0.0500
      const releaseRes = trigger.evaluate(deltaInner);

      expect(releaseRes.triggerRebalance).toBe(false);
      expect(releaseRes.targetHedgeAmount).toBe(0);

      // Step 3: Verify subsequent movement in deadband (e.g. 0.08) does NOT re-trigger
      const deadbandRes = trigger.evaluate(0.08);
      expect(deadbandRes.triggerRebalance).toBe(false);
      expect(deadbandRes.targetHedgeAmount).toBe(0);
    });

    it('terminates rebalance state when delta reaches strictly inside inner boundary |Δ_net| < Δ_inner', () => {
      // Step 1: Trigger breach
      trigger.evaluate(-0.20);

      // Step 2: Delta drops inside inner band: -0.0499
      const releaseRes = trigger.evaluate(-(deltaInner - 1e-4));

      expect(releaseRes.triggerRebalance).toBe(false);
      expect(releaseRes.targetHedgeAmount).toBe(0);
    });

    it('integrates hysteresis retention and release in DeltaNeutralCoordinator', async () => {
      const binance = new MockExchangeConnector('binance');
      const connectors = new Map<string, IExchangeConnector>([['binance', binance]]);
      const coordinator = new DeltaNeutralCoordinator(
        { deltaThreshold: deltaThresh, hysteresisRatio, minLotSize: 0.001 },
        connectors,
      );

      const makeSnapshot = (netDelta: number): PortfolioDeltaSnapshot => ({
        netDelta,
        polyDelta: netDelta,
        polymarketDelta: netDelta,
        cexDelta: 0,
        grossNotionalUsd: 1000,
        positions: [],
        venueSummaries: {},
        marginUtilization: 0.02,
        timestamp: Date.now(),
        toleranceThreshold: deltaThresh,
        rebalanceRequired: Math.abs(netDelta) > deltaThresh,
      });

      // 1. Initial idle
      expect(coordinator.getState()).toBe('IDLE');

      // 2. Breach trigger (+0.12)
      const res1 = await coordinator.coordinate(makeSnapshot(0.12));
      expect(res1.triggered).toBe(true);
      expect(res1.finalState).toBe('REBALANCED');

      // 3. Drop to deltaInner + 1e-4 (+0.0501) -> State should re-trigger hedge
      const res2 = await coordinator.coordinate(makeSnapshot(deltaInner + 1e-4));
      expect(res2.triggered).toBe(true);
      expect(res2.targetHedgeAmount).toBeCloseTo(-0.0501, 4);

      // 4. Drop to exactly deltaInner (0.05) -> State should terminate rebalance
      const res3 = await coordinator.coordinate(makeSnapshot(deltaInner));
      expect(res3.triggered).toBe(false);
      expect(res3.targetHedgeAmount).toBe(0);
      expect(coordinator.getState()).toBe('IDLE');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 3: Extreme Inventories & Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('3. Extreme Inventories & Edge Cases', () => {
    it('handles extreme positive inventory Δ = +100,000 without numeric instability', () => {
      const tracker = new InventoryDeltaTracker({ deltaThreshold: 0.10, totalEquityUsd: 1_000_000 });
      tracker.updatePolymarketPosition('BTC-YES', 100_000, 0.55, 1.0);

      const snap = tracker.getSnapshot();
      expect(snap.netDelta).toBe(100_000);
      expect(snap.polymarketDelta).toBe(100_000);
      expect(snap.grossNotionalUsd).toBe(55_000);
      expect(snap.rebalanceRequired).toBe(true);
      expect(Number.isFinite(snap.netDelta)).toBe(true);
      expect(Number.isFinite(snap.marginUtilization)).toBe(true);
    });

    it('handles extreme negative inventory Δ = -100,000 on CEX with high price ($50,000)', () => {
      const tracker = new InventoryDeltaTracker({ deltaThreshold: 0.10, totalEquityUsd: 1_000_000_000 });
      tracker.updateCexPosition('binance', 'BTC/USDT', -100_000, 50_000, 1.0);

      const snap = tracker.getSnapshot();
      expect(snap.netDelta).toBe(-100_000);
      expect(snap.cexDelta).toBe(-100_000);
      // Notional: 100,000 * 50,000 = 5,000,000,000 (5 billion)
      expect(snap.grossNotionalUsd).toBe(5_000_000_000);
      expect(snap.rebalanceRequired).toBe(true);
      expect(Number.isFinite(snap.grossNotionalUsd)).toBe(true);
      expect(snap.marginUtilization).toBe(1.0); // Capped at 1.0 by Math.min(1.0, ...)
    });

    it('safely caps margin utilization at 1.0 under low equity / extreme notional', () => {
      const tracker = new InventoryDeltaTracker({
        deltaThreshold: 0.10,
        totalEquityUsd: 100, // Very low equity
      });

      tracker.updateCexPosition('binance', 'BTC/USDT', 10, 50_000, 1.0); // $500,000 notional
      const snap = tracker.getSnapshot();

      expect(snap.grossNotionalUsd).toBe(500_000);
      expect(snap.marginUtilization).toBe(1.0); // Must be strictly <= 1.0
    });

    it('handles sub-lot sizes (< minLotSize) with clean suppression in coordinator', () => {
      const coordinator = new DeltaNeutralCoordinator({
        deltaThreshold: 0.10,
        minLotSize: 0.01,
        sizingMode: 'inner_band',
        hysteresisRatio: 0.50,
      });

      // First breach to enter rebalance state
      coordinator.evaluateTolerance(0.20);

      // Now delta drops to 0.055, inner band is 0.05
      // reduction = 0.055 - 0.05 = 0.005
      // 0.005 < minLotSize (0.01) -> MUST suppress hedge
      const res = coordinator.evaluateTolerance(0.055);
      expect(res.triggerRebalance).toBe(false);
      expect(res.targetHedgeAmount).toBe(0);
    });

    it('enforces Zod config validation against zero/negative totalEquityUsd', () => {
      expect(() => {
        DeltaTrackerConfigSchema.parse({ totalEquityUsd: 0 });
      }).toThrow();

      expect(() => {
        DeltaTrackerConfigSchema.parse({ totalEquityUsd: -500 });
      }).toThrow();

      expect(() => {
        DeltaTrackerConfigSchema.parse({ deltaThreshold: 0 });
      }).toThrow();

      expect(() => {
        DeltaNeutralCoordinatorConfigSchema.parse({ minLotSize: -0.01 });
      }).toThrow();
    });

    it('handles zero quantity / position reset cleanly without memory residue', () => {
      const tracker = new InventoryDeltaTracker();
      tracker.updatePolymarketPosition('SOL-YES', 500, 150, 1.0);
      expect(tracker.getNetDelta()).toBe(500);

      tracker.reset();
      expect(tracker.getNetDelta()).toBe(0);
      const snap = tracker.getSnapshot();
      expect(snap.netDelta).toBe(0);
      expect(snap.positions.length).toBe(0);
      expect(Object.keys(snap.venueSummaries).length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Section 4: 1,000-Cycle Rapid Delta Oscillation Simulation
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('4. 1,000-Cycle Rapid Delta Oscillation Simulation', () => {
    it('executes 1,000 rapid oscillation cycles with zero state corruption and deterministic transitions', () => {
      const trigger = new ToleranceBandRebalanceTrigger(0.10, 0.50);
      const coordinator = new DeltaNeutralCoordinator({
        deltaThreshold: 0.10,
        hysteresisRatio: 0.50,
        minLotSize: 0.001,
      });

      // Construct a pseudo-random deterministic oscillation pattern
      const generateCycleDelta = (i: number): number => {
        const mode = i % 4;
        switch (mode) {
          case 0:
            // Outer breach positive
            return 0.15 + (i % 10) * 0.01;
          case 1:
            // Deadband (above inner 0.05, below outer 0.10)
            return 0.07 + (i % 5) * 0.005;
          case 2:
            // Full recovery inside inner band (<= 0.05)
            return 0.02 + (i % 3) * 0.01;
          case 3:
            // Outer breach negative
            return -(0.18 + (i % 10) * 0.01);
          default:
            return 0;
        }
      };

      const results: { cycle: number; triggerRebalance: boolean; targetAmount: number }[] = [];

      for (let i = 0; i < 1000; i++) {
        const delta = generateCycleDelta(i);
        const evalRes = coordinator.evaluateTolerance(delta);

        expect(typeof evalRes.triggerRebalance).toBe('boolean');
        expect(typeof evalRes.targetHedgeAmount).toBe('number');
        expect(Number.isFinite(evalRes.targetHedgeAmount)).toBe(true);

        if (evalRes.triggerRebalance) {
          // Opposite sign to net delta
          expect(Math.sign(evalRes.targetHedgeAmount)).toBe(-Math.sign(delta));
        } else {
          expect(evalRes.targetHedgeAmount).toBe(0);
        }

        results.push({
          cycle: i,
          triggerRebalance: evalRes.triggerRebalance,
          targetAmount: evalRes.targetHedgeAmount,
        });
      }

      expect(results.length).toBe(1000);

      // Verify determinism: repeating the exact 1000 cycles on a fresh coordinator yields 100% identical outputs
      const freshCoordinator = new DeltaNeutralCoordinator({
        deltaThreshold: 0.10,
        hysteresisRatio: 0.50,
        minLotSize: 0.001,
      });

      for (let i = 0; i < 1000; i++) {
        const delta = generateCycleDelta(i);
        const freshRes = freshCoordinator.evaluateTolerance(delta);
        const prevRes = results[i]!;

        expect(freshRes.triggerRebalance).toBe(prevRes.triggerRebalance);
        expect(freshRes.targetHedgeAmount).toBe(prevRes.targetAmount);
      }
    });

    it('verifies zero memory leak and bounded collection size across 1,000 rapid position updates', () => {
      const tracker = new InventoryDeltaTracker({ deltaThreshold: 0.10, roundingDecimals: 4 });

      // Run 1,000 updates over 5 distinct symbols across 2 venues
      const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'DOGE/USDT'];

      for (let i = 0; i < 1000; i++) {
        const sym = symbols[i % symbols.length]!;
        const qty = (i % 20) - 10;
        const price = 100 + (i % 50);

        if (i % 2 === 0) {
          tracker.updatePolymarketPosition(sym, qty, price);
        } else {
          tracker.updateCexPosition('binance', sym, qty, price);
        }

        // Periodically take snapshot
        if (i % 100 === 0) {
          const snap = tracker.getSnapshot();
          expect(Number.isFinite(snap.netDelta)).toBe(true);
        }
      }

      const finalSnap = tracker.getSnapshot();
      // Total positions in map should never exceed 2 venues * 5 symbols = 10
      expect(finalSnap.positions.length).toBeLessThanOrEqual(10);
      expect(Object.keys(finalSnap.venueSummaries).length).toBeLessThanOrEqual(2);
    });
  });
});
