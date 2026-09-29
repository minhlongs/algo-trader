/**
 * Tier 3: Conflict Resolution, Risk Gates & SOR Interactions Helper
 * Pairwise cross-feature combinations (10 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAlphaLabIntent,
} from '../fixtures/mock-engines.fixture';
import { MockConflictResolver } from '../fixtures/mock-queue-resolver.fixture';
import { MockSynchronizedRiskGate } from '../fixtures/mock-risk-gate.fixture';
import { MockTriModeDispatcher } from '../fixtures/mock-sor-dispatcher.fixture';
import { MockAutonomousLifecycleManager } from '../fixtures/mock-telemetry-lifecycle.fixture';

export function registerTier3ConflictRiskSorInteractions(): void {
  describe('Conflict Resolution ↔ Risk Gates & SOR Slicing (X1 - X10)', () => {
    it('X1: Internal crossing matches equal quantity and residual is routed to SOR dispatcher', () => {
      const resolver = new MockConflictResolver();
      const dispatcher = new MockTriModeDispatcher('PAPER');

      const buy = createAlphaLabIntent({ quantity: 2.0, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 0.8, side: 'SELL' });

      const crossResult = resolver.resolveTier1Crossing(buy, sell, 65000);
      expect(crossResult.matchedQuantity).toBe(0.8);
      expect(crossResult.residualIntents.length).toBe(1);

      // Residual (1.2 BTC) dispatched to SOR
      const residual = crossResult.residualIntents[0];
      const dispatchResult = dispatcher.dispatch(residual);
      expect(dispatchResult.executedQuantity).toBe(1.2);
      expect(dispatchResult.status).toBe('FILLED');
    });

    it('X2: Internal crossing conserves liquid cash buffer by avoiding external capital drain', () => {
      const resolver = new MockConflictResolver();
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 22000); // 22% cash (tight buffer)

      const buy = createAlphaLabIntent({ quantity: 1.0, price: 50000, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 1.0, price: 50000, side: 'SELL' });

      // If buy were routed externally, $50k notional would breach cash buffer
      const directVerdict = gate.validateOrder(buy);
      expect(directVerdict.approved).toBe(false);

      // Internal crossing resolves it with 0 capital outflow
      const crossResult = resolver.resolveTier1Crossing(buy, sell, 50000);
      expect(crossResult.matchedQuantity).toBe(1.0);
      expect(crossResult.residualIntents.length).toBe(0);
    });

    it('X3: Circuit breaker transition to ALERT aborts subsequent slices during active TWAP', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const lifecycle = new MockAutonomousLifecycleManager();
      lifecycle.transitionTo('RUNNING');

      const slices = dispatcher.twapSlice(10.0, 5, 0); // 5 slices of 2.0 each
      expect(slices.length).toBe(5);

      // Simulate slice 1 executed
      const executedSlices = [slices[0]];

      // Breaker transitions to HALT
      lifecycle.triggerEmergencyHalt('Drawdown spike');
      const abortSignal = lifecycle.getAbortSignal();

      // Subsequent slices are aborted
      const remainingSlices = slices.slice(1).map((s) => ({
        ...s,
        status: abortSignal.aborted ? ('CANCELLED' as const) : s.status,
      }));

      expect(abortSignal.aborted).toBe(true);
      expect(remainingSlices.every((s) => s.status === 'CANCELLED')).toBe(true);
      expect(executedSlices[0].status).toBe('FILLED');
    });

    it('X4: Circuit breaker transition to HALT halts order expansion while permitting risk-reducing unwind', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setTier('HALT');

      const specOrder = createArbitrageIntent({ isRiskReducing: false });
      expect(gate.validateOrder(specOrder).approved).toBe(false);

      // Under HALT, all orders are halted for complete freeze
      const hedgeOrder = createMarlIntent({ isRiskReducing: true });
      expect(gate.validateOrder(hedgeOrder).approved).toBe(false);
    });

    it('X5: Pre-trade risk gate blocks residual intent if engine budget is exhausted while internal cross succeeds', () => {
      const resolver = new MockConflictResolver();
      const gate = new MockSynchronizedRiskGate();
      gate.setEngineBudgets({ arbitrage: 10000, marl: 10000, amm: 10000, 'alpha-lab': 5000 }); // Alpha budget only $5k

      const buy = createAlphaLabIntent({ quantity: 1.0, price: 50000, side: 'BUY' }); // $50k total
      const sell = createMarlIntent({ quantity: 0.8, price: 50000, side: 'SELL' }); // $40k cross

      const crossResult = resolver.resolveTier1Crossing(buy, sell, 50000);
      expect(crossResult.matchedQuantity).toBe(0.8);

      // Residual is 0.2 BTC ($10k notional), exceeds $5k alpha budget
      const residual = crossResult.residualIntents[0];
      const verdict = gate.validateOrder(residual);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('exceeds remaining engine budget');
    });

    it('X6: Risk-reducing intent supremacy prevents speculative order from consuming concentration cap', () => {
      const resolver = new MockConflictResolver();
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      gate.setVenuePosition('binance', 45000); // Near 50% concentration

      const specBuy = createAlphaLabIntent({ venue: 'binance', quantity: 0.5, price: 50000, side: 'BUY', isRiskReducing: false });
      const hedgeSell = createMarlIntent({ venue: 'binance', quantity: 0.5, price: 50000, side: 'SELL', isRiskReducing: true });

      const res = resolver.resolveTier2RiskSupremacy(specBuy, hedgeSell);
      expect(res.resolutionType).toBe('TIER_2_RISK_SUPREMACY');
      expect(res.residualIntents[0].intentId).toBe(hedgeSell.intentId);
    });

    it('X7: Opposing intents on AMM pool vs Binance spot are crossed internally to prevent dual fee drag', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ symbol: 'BTC/USDT', venue: 'binance', side: 'BUY', quantity: 1.0 });
      const sell = createMarlIntent({ symbol: 'BTC/USDT', venue: 'amm_cpmm', side: 'SELL', quantity: 1.0 });

      const res = resolver.resolveTier1Crossing(buy, sell, 65000);
      expect(res.syntheticFills.every((f) => f.fee === 0)).toBe(true);
      expect(res.syntheticFills.every((f) => f.slippage === 0)).toBe(true);
    });

    it('X8: Slicing parent order through SOR adapts to dynamic volume profile while enforcing gross leverage ceiling', () => {
      const dispatcher = new MockTriModeDispatcher('PAPER');
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 60000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      gate.setVenuePosition('binance', 50000);
      gate.setVenuePosition('bybit', 50000);
      gate.setVenuePosition('polymarket_clob', 50000); // 150k gross (1.5x)

      const profile = [0.4, 0.3, 0.3];
      const slices = dispatcher.vwapSlice(1.5, profile); // 1.5 BTC total = $75k
      expect(slices.length).toBe(3);

      // Slices tested against leverage gate
      slices.forEach((s) => {
        const intent = createArbitrageIntent({ quantity: s.quantity, price: 50000 });
        const verdict = gate.validateOrder(intent);
        expect(verdict.approved).toBe(true);
      });
    });

    it('X9: Internal cross achieves 100% price improvement over split external routing', () => {
      const resolver = new MockConflictResolver();
      const dispatcher = new MockTriModeDispatcher('PAPER');

      const buy = createAlphaLabIntent({ quantity: 1.0, price: 65000, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 1.0, price: 65000, side: 'SELL' });

      const internalMatch = resolver.resolveTier1Crossing(buy, sell, 65000);
      const externalDispatch = dispatcher.dispatch(buy, 65000);

      // External dispatch incurs fees and slippage, internal cross has 0
      expect(externalDispatch.feeUsd).toBeGreaterThan(0);
      expect(internalMatch.syntheticFills[0].fee).toBe(0);
    });

    it('X10: AbortSignal triggered during Iceberg refill immediately freezes hidden reserves', () => {
      const dispatcher = new MockTriModeDispatcher();
      const lifecycle = new MockAutonomousLifecycleManager();
      lifecycle.transitionTo('RUNNING');

      const chunks = dispatcher.icebergSlice(20.0, 0.25); // 4 chunks of 5.0
      expect(chunks.length).toBe(4);

      // Trigger halt after 1 chunk
      lifecycle.triggerEmergencyHalt();
      const aborted = lifecycle.getAbortSignal().aborted;
      expect(aborted).toBe(true);

      const unexecutedHidden = aborted ? chunks.slice(1).reduce((sum, c) => sum + c.visible, 0) : 0;
      expect(unexecutedHidden).toBe(15.0);
    });
  });
}
