import { describe, it, expect } from 'vitest';
import { transition, type StrategyState } from '../../../../src/alpha-lab/attribution/promotion-state-machine';
import { evaluateGates } from '../../../../src/alpha-lab/gates/gate-evaluator';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import { makeTrendUpCandles } from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades } from '../fixtures/test-helpers';

export function registerTier3GatesLifecycleTests(): void {
  describe('Pairwise Track 3: Paper Trading -> Promotion State Machine & 10+1 Gates (R2 -> R3)', () => {
    it('P3.1: 35-day paper performance meeting all 10 transition criteria passes evaluateGates', () => {
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400000).toISOString();
      const trades = makeSyntheticTrades(60, 0.62, 100000);
      const closes = makeTrendUpCandles(70).map((c) => ({ timestamp: c.timestamp }));
      const equityCurve = buildEquityCurve(closes, trades);

      const readiness = evaluateGates({
        trades,
        startDate: thirtyFiveDaysAgo,
        equityCurve,
        testWinRate: 0.60,
        valWinRate: 0.62,
        flags: { kellyWired: true, circuitBreakerTested: true, exchangeConnectivityGreen: true },
      });

      expect(readiness.totalGates).toBe(10);
      expect(readiness.passedCount).toBe(10);
      expect(readiness.allPassed).toBe(true);
      expect(readiness.estimatedDaysRemaining).toBe(0);
    });

    it('P3.2: 10+1 statistical validation gate evaluates Monte Carlo p-value and bootstrap Sharpe CI', () => {
      const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 86400000).toISOString();
      const trades = makeSyntheticTrades(60, 0.65, 100000);
      const closes = makeTrendUpCandles(70).map((c) => ({ timestamp: c.timestamp }));
      const equityCurve = buildEquityCurve(closes, trades);

      const readinessWithSignificance = evaluateGates({
        trades,
        startDate: thirtyFiveDaysAgo,
        equityCurve,
        testWinRate: 0.60,
        valWinRate: 0.62,
        flags: { kellyWired: true, circuitBreakerTested: true, exchangeConnectivityGreen: true },
        statisticalValidation: { pValueSharpe: 0.015, sharpeCiLower: 1.1 },
      });

      expect(readinessWithSignificance.totalGates).toBe(11);
      expect(readinessWithSignificance.allPassed).toBe(true);
      const statGate = readinessWithSignificance.gates.find((g) => g.id === 'statistical_significance');
      expect(statGate?.passed).toBe(true);
    });

    it('P3.3: passing survival and statistical gates transitions promotion state machine from CANDIDATE to PAPER_APPROVED', () => {
      let state: StrategyState = 'CANDIDATE';
      state = transition(state, 'evaluate', {});
      expect(state).toBe('EVALUATED');
      state = transition(state, 'baseline', {});
      expect(state).toBe('BASELINE_GATE');
      state = transition(state, 'walkforward', {});
      expect(state).toBe('WALK_FORWARD');
      state = transition(state, 'survival', {
        winRate: 0.60, sharpe: 1.5, totalNetPnl: 1000, randomPnl: 100, consistencyScore: 0.70, testTrades: 25, overfitGap: 0.05,
      });
      expect(state).toBe('SURVIVAL_GATE');
      state = transition(state, 'promote', {});
      expect(state).toBe('PAPER_APPROVED');
    });

    it('P3.4: paper trading drawdown breach (20% > 15% threshold) fails evaluateGates and triggers retirement', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const badTrades = makeSyntheticTrades(50, 0.40, 100000);
      const depressedCurve = [
        { timestamp: thirtyDaysAgo, equity: 100000 },
        { timestamp: new Date(Date.now() - 15 * 86400000).toISOString(), equity: 110000 },
        { timestamp: new Date().toISOString(), equity: 85000 },
      ];

      const readiness = evaluateGates({
        trades: badTrades,
        startDate: thirtyDaysAgo,
        equityCurve: depressedCurve,
        flags: { kellyWired: true, circuitBreakerTested: true, exchangeConnectivityGreen: true },
      });

      expect(readiness.allPassed).toBe(false);
      expect(readiness.gates.find((g) => g.id === 'max_drawdown')?.passed).toBe(false);

      const retiredState = transition('SURVIVAL_GATE', 'reject', { reason: 'max_drawdown_exceeded', drawdown: 0.22 });
      expect(retiredState).toBe('REJECTED');
    });

    it('P3.5: OOS consistency gap exceeding 0.05 limit fails gate and prevents promotion', () => {
      const thirtyDaysAgo = new Date(Date.now() - 32 * 86400000).toISOString();
      const trades = makeSyntheticTrades(55, 0.60, 100000);
      const closes = makeTrendUpCandles(60).map((c) => ({ timestamp: c.timestamp }));
      const equityCurve = buildEquityCurve(closes, trades);

      const readiness = evaluateGates({
        trades,
        startDate: thirtyDaysAgo,
        equityCurve,
        testWinRate: 0.45,
        valWinRate: 0.65,
        flags: { kellyWired: true, circuitBreakerTested: true, exchangeConnectivityGreen: true },
      });

      expect(readiness.allPassed).toBe(false);
      expect(readiness.gates.find((g) => g.id === 'oos_consistency')?.passed).toBe(false);
    });
  });
}
