/**
 * Adversarial Empirical Stress Tests for Milestone 3 Alpha-Lab
 * Target: AlphaLifecycleStateMachine (src/alpha-lab/attribution/alpha-lifecycle-state-machine.ts)
 *
 * Verifies:
 * 1. Boundary condition at exact maxDrawdown = 0.15 (passes/no retire) vs 0.1501 (retires).
 * 2. Sample size boundary: trade count 14 with negative PnL & low winRate (does NOT retire) vs trade count 15 (retires).
 * 3. Win rate boundary: win rate 0.45 (does not retire) vs 0.449 (retires when tradeCount >= 15 & netPnl < 0).
 * 4. OOS consistency gap divergence boundary: gap 0.10 (does not retire) vs 0.101 (retires).
 * 5. Absorbing state property: once RETIRED, multiple evaluate() calls, startPaperTrading(), and retire() cannot transition out.
 * 6. Promotion: all 10+1 criteria pass vs when exactly 1 criterion fails across each individual gate.
 */

import { describe, it, expect } from 'vitest';
import {
  AlphaLifecycleStateMachine,
  extractGateMetrics,
} from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { GateEvaluatorInput } from '../../../../src/alpha-lab/gates/gate-evaluator-types';
import type { BacktestTrade } from '../../../../src/desk/backtesting/types';

function makeStressTrades(
  count: number,
  winCount: number,
  winPnl = 2000,
  lossPnl = -1000,
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  for (let i = 0; i < count; i++) {
    const isWin = i < winCount;
    trades.push({
      id: `stress-trade-${i}`,
      strategyId: 'strat-stress',
      symbol: 'BTC/USDT',
      direction: 'BUY',
      entryPrice: 50000,
      exitPrice: isWin ? 52000 : 49000,
      size: 1,
      entryTime: 1700000000000 + i * 3600000,
      exitTime: 1700000000000 + i * 3600000 + 1800000,
      pnl: isWin ? winPnl : lossPnl,
      fees: 10,
    });
  }
  return trades;
}

function makePassingGateInput(): GateEvaluatorInput {
  const startDate = new Date(Date.now() - 35 * 86400000).toISOString();
  const equityCurve: Array<{ timestamp: string; equity: number }> = [];
  let eq = 100000;
  for (let i = 0; i <= 35; i++) {
    eq += 300;
    equityCurve.push({
      timestamp: new Date(1700000000000 + i * 86400000).toISOString(),
      equity: eq,
    });
  }

  return {
    trades: makeStressTrades(55, 33),
    startDate,
    equityCurve,
    testWinRate: 0.58,
    valWinRate: 0.60,
    flags: {
      kellyWired: true,
      circuitBreakerTested: true,
      exchangeConnectivityGreen: true,
    },
  };
}

describe('AlphaLifecycleStateMachine Empirical Stress Tests', () => {
  describe('Boundary 1: Max Drawdown (0.1500 vs 0.1501)', () => {
    it('exact maxDrawdown = 0.15 passes the gate and does not retire the alpha', () => {
      const sm = new AlphaLifecycleStateMachine('strat-dd-boundary-pass', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.equityCurve = [
        { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
        { timestamp: '2026-01-02T00:00:00.000Z', equity: 85000 }, // DD = (100k - 85k)/100k = 0.1500
        { timestamp: '2026-01-03T00:00:00.000Z', equity: 95000 },
      ];

      const metrics = extractGateMetrics(input);
      expect(metrics.maxDrawdown).toBe(0.15);

      const result = sm.evaluate(input);
      const ddGate = result.verdict.gates.find((g) => g.id === 'max_drawdown');

      expect(ddGate).toBeDefined();
      expect(ddGate?.passed).toBe(true);
      expect(result.state).not.toBe('RETIRED');
      expect(sm.isRetired()).toBe(false);
    });

    it('maxDrawdown = 0.1501 breaches threshold, fails the gate, and triggers RETIRED state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-dd-boundary-fail', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.equityCurve = [
        { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
        { timestamp: '2026-01-02T00:00:00.000Z', equity: 84990 }, // DD = (100k - 84990)/100k = 0.1501
        { timestamp: '2026-01-03T00:00:00.000Z', equity: 95000 },
      ];

      const metrics = extractGateMetrics(input);
      expect(metrics.maxDrawdown).toBe(0.1501);

      const result = sm.evaluate(input);
      const ddGate = result.verdict.gates.find((g) => g.id === 'max_drawdown');

      expect(ddGate?.passed).toBe(false);
      expect(result.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(result.transition).toBeDefined();
      expect(result.transition?.fromState).toBe('PAPER_ACTIVE');
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/drawdown breach: 15\.01% > 15\.00%/i);
    });
  });

  describe('Boundary 2: Sample Size Boundary for Expectancy Retirement (14 vs 15)', () => {
    it('14 trades with negative PnL and sub-45% win rate does NOT retire', () => {
      const sm = new AlphaLifecycleStateMachine('strat-sample-14', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // 14 trades: 4 wins ($100 each = $400), 10 losses (-$200 each = -$2000), net = -$1600
      input.trades = makeStressTrades(14, 4, 100, -200);

      const metrics = extractGateMetrics(input);
      expect(metrics.tradeCount).toBe(14);
      expect(metrics.winRate).toBeLessThan(0.45);
      expect(metrics.totalNetPnl).toBeLessThan(0);

      const result = sm.evaluate(input);

      expect(result.state).toBe('PAPER_ACTIVE');
      expect(sm.isRetired()).toBe(false);
      expect(result.transition).toBeUndefined();
    });

    it('15 trades with negative PnL and sub-45% win rate triggers RETIRED state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-sample-15', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // 15 trades: 4 wins ($100 each = $400), 11 losses (-$200 each = -$2200), net = -$1800
      input.trades = makeStressTrades(15, 4, 100, -200);

      const metrics = extractGateMetrics(input);
      expect(metrics.tradeCount).toBe(15);
      expect(metrics.winRate).toBeLessThan(0.45);
      expect(metrics.totalNetPnl).toBeLessThan(0);

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/persistent negative expectancy/i);
    });
  });

  describe('Boundary 3: Win Rate Boundary at Sample Size >= 15 & Negative Net PnL (0.4500 vs 0.4490)', () => {
    it('exact win rate = 0.4500 does NOT retire even with trades >= 15 and net PnL < 0', () => {
      const sm = new AlphaLifecycleStateMachine('strat-wr-450', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // 20 trades: 9 wins ($10 each = $90), 11 losses (-$20 each = -$220), net = -$130
      // win rate = 9 / 20 = 0.4500
      input.trades = makeStressTrades(20, 9, 10, -20);

      const metrics = extractGateMetrics(input);
      expect(metrics.tradeCount).toBe(20);
      expect(metrics.winRate).toBe(0.45);
      expect(metrics.totalNetPnl).toBeLessThan(0);

      const result = sm.evaluate(input);

      expect(result.state).toBe('PAPER_ACTIVE');
      expect(sm.isRetired()).toBe(false);
      expect(result.transition).toBeUndefined();
    });

    it('win rate = 0.4490 with trades >= 15 and net PnL < 0 triggers RETIRED state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-wr-449', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // 1000 trades: 449 wins ($1 each), 551 losses (-$2 each), net = -$653
      // win rate = 449 / 1000 = 0.4490 < 0.45
      input.trades = makeStressTrades(1000, 449, 1, -2);

      const metrics = extractGateMetrics(input);
      expect(metrics.tradeCount).toBe(1000);
      expect(metrics.winRate).toBe(0.449);
      expect(metrics.totalNetPnl).toBeLessThan(0);

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/persistent negative expectancy/i);
    });
  });

  describe('Boundary 4: OOS Consistency Gap Divergence (0.1000 vs 0.1010)', () => {
    it('exact OOS consistency gap = 0.1000 fails promotion gate but does NOT retire', () => {
      const sm = new AlphaLifecycleStateMachine('strat-oos-100', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.valWinRate = 0.65;
      input.testWinRate = 0.55; // gap = 0.65 - 0.55 = 0.1000

      const metrics = extractGateMetrics(input);
      expect(metrics.oosGap).toBeCloseTo(0.10, 4);

      const result = sm.evaluate(input);
      const oosGate = result.verdict.gates.find((g) => g.id === 'oos_consistency');

      // Gate fails because threshold is 0.05
      expect(oosGate?.passed).toBe(false);
      // But does NOT trigger retirement (threshold is > 0.10)
      expect(result.state).toBe('PAPER_ACTIVE');
      expect(sm.isRetired()).toBe(false);
      expect(result.transition).toBeUndefined();
    });

    it('OOS consistency gap = 0.1010 triggers immediate RETIRED state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-oos-101', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.valWinRate = 0.651;
      input.testWinRate = 0.55; // gap = 0.651 - 0.55 = 0.1010

      const metrics = extractGateMetrics(input);
      expect(metrics.oosGap).toBeCloseTo(0.101, 4);

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/OOS consistency divergence: gap 0\.1010 > 0\.10/i);
    });
  });

  describe('Property 5: Absorbing State Invariant of RETIRED', () => {
    it('once RETIRED, evaluate(), startPaperTrading(), and retire() cannot transition out of RETIRED', () => {
      const sm = new AlphaLifecycleStateMachine('strat-absorbing-invariants', 'PAPER_ACTIVE');

      // 1. Initial retirement
      const trans = sm.retire('Administrative risk shutdown');
      expect(sm.getState()).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(trans.toState).toBe('RETIRED');

      const initialHistoryCount = sm.getHistory().length;
      expect(initialHistoryCount).toBe(1);

      // 2. Sequential evaluate() calls with pristine passing inputs
      for (let i = 0; i < 5; i++) {
        const passingInput = makePassingGateInput();
        const evalResult = sm.evaluate(passingInput);

        expect(evalResult.state).toBe('RETIRED');
        expect(evalResult.transition).toBeUndefined();
        expect(sm.getState()).toBe('RETIRED');
        expect(sm.isRetired()).toBe(true);
        expect(sm.isLiveEligible()).toBe(false);
      }

      // History should not have received spurious transitions
      expect(sm.getHistory()).toHaveLength(initialHistoryCount);

      // 3. startPaperTrading() must throw and keep state RETIRED
      expect(() => sm.startPaperTrading()).toThrow(/absorbing state/i);
      expect(sm.getState()).toBe('RETIRED');

      // 4. retire() must throw and keep state RETIRED
      expect(() => sm.retire('Secondary shutdown')).toThrow(/already RETIRED/i);
      expect(sm.getState()).toBe('RETIRED');
    });
  });

  describe('Property 6: Promotion Matrix (All 10+1 Criteria Pass vs Exactly 1 Fails)', () => {
    it('promotes PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE when all 10 canonical gates pass', () => {
      const sm = new AlphaLifecycleStateMachine('strat-all-10-pass', 'PAPER_ACTIVE');
      const input = makePassingGateInput();

      const result = sm.evaluate(input);

      expect(result.state).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(result.verdict.allPassed).toBe(true);
      expect(result.verdict.totalGates).toBe(10);
      expect(result.verdict.passedCount).toBe(10);
      expect(sm.isLiveEligible()).toBe(true);
      expect(result.transition).toBeDefined();
      expect(result.transition?.fromState).toBe('PAPER_ACTIVE');
      expect(result.transition?.toState).toBe('PROMOTED_LIVE_ELIGIBLE');
    });

    it('promotes PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE when all 10 canonical + statistical gate pass (11 total)', () => {
      const sm = new AlphaLifecycleStateMachine('strat-all-11-pass', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.statisticalValidation = {
        pValueSharpe: 0.02,
        sharpeCiLower: 0.75,
        sharpeCiUpper: 2.10,
      };

      const result = sm.evaluate(input);

      expect(result.state).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(result.verdict.allPassed).toBe(true);
      expect(result.verdict.totalGates).toBe(11);
      expect(result.verdict.passedCount).toBe(11);
      expect(sm.isLiveEligible()).toBe(true);
    });

    const singleGateFailureMatrix: Array<{
      gateName: string;
      gateId: string;
      mutate: (input: GateEvaluatorInput) => void;
    }> = [
      {
        gateName: 'duration (< 30 days)',
        gateId: 'duration',
        mutate: (inp) => {
          inp.startDate = new Date(Date.now() - 29 * 86400000).toISOString();
        },
      },
      {
        gateName: 'trade_count (< 50 trades)',
        gateId: 'trade_count',
        mutate: (inp) => {
          inp.trades = makeStressTrades(49, 32);
        },
      },
      {
        gateName: 'win_rate (< 55%)',
        gateId: 'win_rate',
        mutate: (inp) => {
          // 50 trades, 27 wins (54%), winPnl 2000, lossPnl -1000 -> positive net PnL
          inp.trades = makeStressTrades(50, 27, 2000, -1000);
        },
      },
      {
        gateName: 'profit_factor (< 1.30)',
        gateId: 'profit_factor',
        mutate: (inp) => {
          // 50 trades, 30 wins ($400 = $12000), 20 losses (-$500 = -$10000) -> PF = 1.20, positive net PnL
          inp.trades = makeStressTrades(50, 30, 400, -500);
        },
      },
      {
        gateName: 'sharpe_ratio (< 1.0)',
        gateId: 'sharpe_ratio',
        mutate: (inp) => {
          // Flat equity curve has zero variance -> Sharpe = 0
          inp.equityCurve = [
            { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
            { timestamp: '2026-01-02T00:00:00.000Z', equity: 100000 },
            { timestamp: '2026-01-03T00:00:00.000Z', equity: 100000 },
          ];
        },
      },
      {
        gateName: 'oos_consistency (gap > 0.05 but <= 0.10)',
        gateId: 'oos_consistency',
        mutate: (inp) => {
          inp.valWinRate = 0.64;
          inp.testWinRate = 0.56; // gap = 0.08
        },
      },
      {
        gateName: 'kelly_wired (false)',
        gateId: 'kelly_wired',
        mutate: (inp) => {
          inp.flags = { ...inp.flags, kellyWired: false };
        },
      },
      {
        gateName: 'circuit_breaker (false)',
        gateId: 'circuit_breaker',
        mutate: (inp) => {
          inp.flags = { ...inp.flags, circuitBreakerTested: false };
        },
      },
      {
        gateName: 'exchange_connectivity (false)',
        gateId: 'exchange_connectivity',
        mutate: (inp) => {
          inp.flags = { ...inp.flags, exchangeConnectivityGreen: false };
        },
      },
      {
        gateName: 'statistical_significance p-value (>= 0.05)',
        gateId: 'statistical_significance',
        mutate: (inp) => {
          inp.statisticalValidation = {
            pValueSharpe: 0.07,
            sharpeCiLower: 0.5,
            sharpeCiUpper: 2.0,
          };
        },
      },
      {
        gateName: 'statistical_significance CI lower bound (<= 0)',
        gateId: 'statistical_significance',
        mutate: (inp) => {
          inp.statisticalValidation = {
            pValueSharpe: 0.02,
            sharpeCiLower: -0.10,
            sharpeCiUpper: 1.8,
          };
        },
      },
    ];

    for (const { gateName, gateId, mutate } of singleGateFailureMatrix) {
      it(`does NOT promote when only ${gateName} fails`, () => {
        const sm = new AlphaLifecycleStateMachine(`strat-fail-${gateId}`, 'PAPER_ACTIVE');
        const input = makePassingGateInput();
        mutate(input);

        const result = sm.evaluate(input);
        const failedGates = result.verdict.gates.filter((g) => !g.passed);

        expect(failedGates).toHaveLength(1);
        expect(failedGates[0].id).toBe(gateId);
        expect(result.verdict.allPassed).toBe(false);
        expect(result.state).toBe('PAPER_ACTIVE');
        expect(result.transition).toBeUndefined();
        expect(sm.isLiveEligible()).toBe(false);
      });
    }
  });
});
