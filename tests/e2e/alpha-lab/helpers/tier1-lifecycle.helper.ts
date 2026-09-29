import { describe, it, expect } from 'vitest';
import { AlphaLifecycleStateMachine } from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import { transition } from '../../../../src/alpha-lab/attribution/promotion-state-machine';
import { evaluateGates } from '../../../../src/alpha-lab/gates/gate-evaluator';
import { LiveExecutionGuard } from '../../../../src/desk/execution/live-execution-guard-core';
import { makeGateEvaluatorInput, makeSyntheticTrades, makeCandidateResult } from '../fixtures/test-helpers';
import { makeTrendUpCandles } from '../fixtures/market-data-fixtures';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';

export function registerTier1LifecycleTests(): void {
  describe('Feature 9: Canonical 6-State Lifecycle State Machine (F9)', () => {
    it('F9.1: initializes candidate in DISCOVERED state', () => {
      const sm = new AlphaLifecycleStateMachine('test-strat-01');
      expect(sm.getState()).toBe('DISCOVERED');
      expect(sm.isLiveEligible()).toBe(false);
      expect(sm.isRetired()).toBe(false);
    });

    it('F9.2: transitions DISCOVERED -> PAPER_ACTIVE upon ingestion into paper trading', () => {
      const sm = new AlphaLifecycleStateMachine('test-strat-02');
      const t = sm.startPaperTrading('Beginning paper validation');
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(t.fromState).toBe('DISCOVERED');
      expect(t.toState).toBe('PAPER_ACTIVE');
    });

    it('F9.3: transitions PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE when all promotion hurdles pass', () => {
      const sm = new AlphaLifecycleStateMachine('test-strat-03', 'PAPER_ACTIVE');
      const input = makeGateEvaluatorInput();
      const res = sm.evaluate(input);
      expect(res.verdict.allPassed).toBe(true);
      expect(sm.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm.isLiveEligible()).toBe(true);
    });

    it('F9.4: transitions to RETIRED upon drawdown limit breach or terminal failure', () => {
      const sm = new AlphaLifecycleStateMachine('test-strat-04', 'PAPER_ACTIVE');
      const badTrades = makeSyntheticTrades(50, 0.2, 50, -300);
      const eq = buildEquityCurve(makeTrendUpCandles(55).map((c) => ({ timestamp: c.timestamp })), badTrades);
      const res = sm.evaluate(makeGateEvaluatorInput({ trades: badTrades, equityCurve: eq }));
      expect(sm.getState()).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(res.transition?.toState).toBe('RETIRED');
    });

    it('F9.5: enforces absorbing state behavior: RETIRED rejects further activations', () => {
      const sm = new AlphaLifecycleStateMachine('test-strat-05', 'RETIRED');
      expect(() => sm.startPaperTrading()).toThrow(/absorbing state/);
    });
  });

  describe('Feature 10: Live Promotion Protocol (F10)', () => {
    it('F10.1: evaluates duration requirement (>= 30 days) in paper trading', () => {
      const inputPass = makeGateEvaluatorInput({ startDate: new Date(Date.now() - 32 * 86400000).toISOString() });
      const readinessPass = evaluateGates(inputPass);
      const durationGatePass = readinessPass.gates.find((g) => g.id === 'duration');
      expect(durationGatePass?.passed).toBe(true);

      const inputFail = makeGateEvaluatorInput({ startDate: new Date(Date.now() - 10 * 86400000).toISOString() });
      const readinessFail = evaluateGates(inputFail);
      const durationGateFail = readinessFail.gates.find((g) => g.id === 'duration');
      expect(durationGateFail?.passed).toBe(false);
    });

    it('F10.2: evaluates trade sample requirement (>= 50 trades completed)', () => {
      const trades55 = makeSyntheticTrades(55, 0.65, 200, -100);
      const readiness55 = evaluateGates(makeGateEvaluatorInput({ trades: trades55 }));
      expect(readiness55.gates.find((g) => g.id === 'trade_count')?.passed).toBe(true);

      const trades20 = makeSyntheticTrades(20, 0.65, 200, -100);
      const readiness20 = evaluateGates(makeGateEvaluatorInput({ trades: trades20 }));
      expect(readiness20.gates.find((g) => g.id === 'trade_count')?.passed).toBe(false);
    });

    it('F10.3: evaluates win rate (>= 55%) and profit factor (>= 1.3) promotion hurdles', () => {
      const readiness = evaluateGates(makeGateEvaluatorInput());
      expect(readiness.gates.find((g) => g.id === 'win_rate')?.passed).toBe(true);
      expect(readiness.gates.find((g) => g.id === 'profit_factor')?.passed).toBe(true);
    });

    it('F10.4: evaluates out-of-sample consistency (OOS gap <= 0.05 between train/val and test)', () => {
      const pass = evaluateGates(makeGateEvaluatorInput({ testWinRate: 0.62, valWinRate: 0.60 }));
      expect(pass.gates.find((g) => g.id === 'oos_consistency')?.passed).toBe(true);

      const fail = evaluateGates(makeGateEvaluatorInput({ testWinRate: 0.50, valWinRate: 0.70 }));
      expect(fail.gates.find((g) => g.id === 'oos_consistency')?.passed).toBe(false);
    });

    it('F10.5: evaluates full 10+1 gate suite returning PromotionReadiness for live eligibility', () => {
      const readiness = evaluateGates(makeGateEvaluatorInput());
      expect(readiness.totalGates).toBe(11);
      expect(readiness.allPassed).toBe(true);
    });
  });

  describe('Feature 11: Circuit Breaker Quarantine & Signal Blocking (F11)', () => {
    it('F11.1: trips circuit breaker when peak-to-trough paper drawdown breaches limit', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, maxDailyDrawdown: 0.05, enabled: true });
      guard.recordLoss(-6000);
      const order = { id: 'ord1', clientOrderId: 'c1', market: '0x123', side: 'BUY' as const, price: 0.5, size: 100 };
      expect(guard.guardOrder(order).approved).toBe(false);
    });

    it('F11.2: transitions state to REJECTED or QUARANTINED upon severe drawdown breach', () => {
      const sm = new AlphaLifecycleStateMachine('strat-f11-breaker', 'PAPER_ACTIVE');
      const input = makeGateEvaluatorInput({
        equityCurve: [
          { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
          { timestamp: '2026-01-02T00:00:00.000Z', equity: 75000 },
        ],
      });
      const res = sm.evaluate(input);
      expect(res.state).toBe('RETIRED');
      expect(sm.getState()).toBe('RETIRED');
    });

    it('F11.3: blocks order and signal routing when circuit breaker is tripped', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, maxConsecutiveLosses: 2, enabled: true });
      guard.recordLoss(-100);
      guard.recordLoss(-100);
      const order = { id: 'ord2', clientOrderId: 'c2', market: '0x123', side: 'BUY' as const, price: 0.5, size: 100 };
      const verdict = guard.guardOrder(order);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('Circuit breaker');
    });

    it('F11.4: trips execution guard after consecutive losses streak', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, maxConsecutiveLosses: 3, enabled: true });
      guard.recordLoss(-100);
      guard.recordLoss(-100);
      expect(guard.getStatus().circuitTripped).toBe(false);
      guard.recordLoss(-100);
      expect(guard.getStatus().circuitTripped).toBe(true);
    });

    it('F11.5: allows controlled recovery / manual reset restoring approval', () => {
      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, maxConsecutiveLosses: 2, enabled: true });
      guard.recordLoss(-50);
      guard.recordLoss(-50);
      expect(guard.getStatus().circuitTripped).toBe(true);
      guard.resetCircuit();
      expect(guard.getStatus().circuitTripped).toBe(false);
    });
  });
}
