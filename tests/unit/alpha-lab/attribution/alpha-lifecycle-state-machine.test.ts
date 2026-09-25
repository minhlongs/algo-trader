import { describe, it, expect } from 'vitest';
import {
  AlphaLifecycleStateMachine,
  extractGateMetrics,
  mapStrategyStateToLifecycleState,
  type AlphaLifecycleState,
} from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { GateEvaluatorInput } from '../../../../src/alpha-lab/gates/gate-evaluator-types';
import type { BacktestTrade } from '../../../../src/desk/backtesting/types';
import type { StrategyState } from '../../../../src/alpha-lab/attribution/promotion-state-machine';

function makePassingTrades(count = 55): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const winCount = Math.ceil(count * 0.60); // 60% win rate >= 55%

  for (let i = 0; i < count; i++) {
    const isWin = i < winCount;
    trades.push({
      id: `trade-${i}`,
      strategyId: 'strat-1',
      symbol: 'BTC/USDT',
      direction: 'BUY',
      entryPrice: 50000,
      exitPrice: isWin ? 52000 : 49000,
      size: 1,
      entryTime: 1700000000000 + i * 3600000,
      exitTime: 1700000000000 + i * 3600000 + 1800000,
      pnl: isWin ? 2000 : -1000, // profit factor: (33 * 2000) / (22 * 1000) = 66000 / 22000 = 3.0 >= 1.3
      fees: 10,
    });
  }
  return trades;
}

function makePassingEquityCurve(days = 35): Array<{ timestamp: string; equity: number }> {
  const curve: Array<{ timestamp: string; equity: number }> = [];
  let eq = 100000;
  for (let i = 0; i <= days; i++) {
    eq += 300; // steady upward equity, near zero drawdown, strong sharpe
    curve.push({
      timestamp: new Date(1700000000000 + i * 86400000).toISOString(),
      equity: eq,
    });
  }
  return curve;
}

function makePassingGateInput(): GateEvaluatorInput {
  const startDate = new Date(Date.now() - 35 * 86400000).toISOString(); // 35 days ago >= 30 days
  return {
    trades: makePassingTrades(55),
    startDate,
    equityCurve: makePassingEquityCurve(35),
    testWinRate: 0.58,
    valWinRate: 0.60, // gap = 0.02 <= 0.05
    flags: {
      kellyWired: true,
      circuitBreakerTested: true,
      exchangeConnectivityGreen: true,
    },
  };
}

describe('AlphaLifecycleStateMachine', () => {
  describe('State Initialization & Properties', () => {
    it('initializes to DISCOVERED by default', () => {
      const sm = new AlphaLifecycleStateMachine('strat-alpha');
      expect(sm.getState()).toBe('DISCOVERED');
      expect(sm.getStrategyId()).toBe('strat-alpha');
      expect(sm.isLiveEligible()).toBe(false);
      expect(sm.isRetired()).toBe(false);
      expect(sm.getHistory()).toEqual([]);
    });

    it('allows custom initial state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-beta', 'PAPER_ACTIVE');
      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(sm.isLiveEligible()).toBe(false);
      expect(sm.isRetired()).toBe(false);
    });

    it('identifies PROMOTED_LIVE_ELIGIBLE correctly', () => {
      const sm = new AlphaLifecycleStateMachine('strat-live', 'PROMOTED_LIVE_ELIGIBLE');
      expect(sm.isLiveEligible()).toBe(true);
      expect(sm.isRetired()).toBe(false);
    });

    it('identifies RETIRED correctly', () => {
      const sm = new AlphaLifecycleStateMachine('strat-dead', 'RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);
    });
  });

  describe('startPaperTrading', () => {
    it('transitions DISCOVERED -> PAPER_ACTIVE', () => {
      const sm = new AlphaLifecycleStateMachine('strat-1');
      const transition = sm.startPaperTrading('Beginning paper trading phase');

      expect(sm.getState()).toBe('PAPER_ACTIVE');
      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('PAPER_ACTIVE');
      expect(transition.strategyId).toBe('strat-1');
      expect(transition.reason).toBe('Beginning paper trading phase');
      expect(sm.getHistory()).toHaveLength(1);
      expect(sm.getHistory()[0]).toEqual(transition);
    });

    it('uses default reason if not provided', () => {
      const sm = new AlphaLifecycleStateMachine('strat-1');
      const transition = sm.startPaperTrading();
      expect(transition.reason).toBe('Strategy ingested into paper trading execution loop');
    });

    it('throws when starting paper trading from RETIRED state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-1', 'RETIRED');
      expect(() => sm.startPaperTrading()).toThrow(/absorbing state/i);
    });

    it('throws when starting paper trading from PAPER_ACTIVE state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-1', 'PAPER_ACTIVE');
      expect(() => sm.startPaperTrading()).toThrow(/expected DISCOVERED/i);
    });

    it('throws when starting paper trading from PROMOTED_LIVE_ELIGIBLE state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-1', 'PROMOTED_LIVE_ELIGIBLE');
      expect(() => sm.startPaperTrading()).toThrow(/expected DISCOVERED/i);
    });
  });

  describe('evaluate — Promotion Path', () => {
    it('promotes PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE when all 10 canonical gates pass', () => {
      const sm = new AlphaLifecycleStateMachine('strat-promotable', 'PAPER_ACTIVE');
      const input = makePassingGateInput();

      const result = sm.evaluate(input);

      expect(result.state).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(result.verdict.allPassed).toBe(true);
      expect(result.verdict.totalGates).toBe(10);
      expect(result.transition).toBeDefined();
      expect(result.transition?.fromState).toBe('PAPER_ACTIVE');
      expect(result.transition?.toState).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(result.transition?.strategyId).toBe('strat-promotable');
      expect(sm.isLiveEligible()).toBe(true);
      expect(sm.getHistory()).toHaveLength(1);
    });

    it('promotes when 11th statistical gate passes', () => {
      const sm = new AlphaLifecycleStateMachine('strat-stat', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.statisticalValidation = {
        pValueSharpe: 0.01,
        sharpeCiLower: 0.8,
        sharpeCiUpper: 2.1,
      };

      const result = sm.evaluate(input);

      expect(result.state).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(result.verdict.allPassed).toBe(true);
      expect(result.verdict.totalGates).toBe(11);
      expect(sm.isLiveEligible()).toBe(true);
    });

    it('does not promote when 11th statistical gate fails', () => {
      const sm = new AlphaLifecycleStateMachine('strat-stat-fail', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.statisticalValidation = {
        pValueSharpe: 0.12, // >= 0.05 -> fails
        sharpeCiLower: -0.2, // <= 0 -> fails
        sharpeCiUpper: 1.5,
      };

      const result = sm.evaluate(input);

      expect(result.state).toBe('PAPER_ACTIVE');
      expect(result.verdict.allPassed).toBe(false);
      expect(result.transition).toBeUndefined();
      expect(sm.isLiveEligible()).toBe(false);
    });

    it('does not promote when only partial gates pass', () => {
      const sm = new AlphaLifecycleStateMachine('strat-incomplete', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // Make trade count insufficient: 20 trades < 50 threshold
      input.trades = makePassingTrades(20);

      const result = sm.evaluate(input);

      expect(result.state).toBe('PAPER_ACTIVE');
      expect(result.verdict.allPassed).toBe(false);
      expect(result.transition).toBeUndefined();
      expect(sm.isLiveEligible()).toBe(false);
      expect(sm.getHistory()).toHaveLength(0);
    });

    it('does not promote if state is DISCOVERED even if gates pass', () => {
      const sm = new AlphaLifecycleStateMachine('strat-disc', 'DISCOVERED');
      const input = makePassingGateInput();

      const result = sm.evaluate(input);

      expect(result.state).toBe('DISCOVERED');
      expect(result.transition).toBeUndefined();
      expect(sm.isLiveEligible()).toBe(false);
    });
  });

  describe('evaluate — Retirement Triggers', () => {
    it('retires on severe drawdown breach (> 15%)', () => {
      const sm = new AlphaLifecycleStateMachine('strat-dd', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // Create a drawdown of 22%
      input.equityCurve = [
        { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
        { timestamp: '2026-01-10T00:00:00.000Z', equity: 120000 }, // Peak
        { timestamp: '2026-01-20T00:00:00.000Z', equity: 93600 },  // Drawdown = (120000 - 93600) / 120000 = 22%
      ];

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(result.transition).toBeDefined();
      expect(result.transition?.fromState).toBe('PAPER_ACTIVE');
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/drawdown breach/i);
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);
    });

    it('retires on persistent negative expectancy: net PnL < 0 AND win rate < 0.45 when trades >= 15', () => {
      const sm = new AlphaLifecycleStateMachine('strat-bleeder', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // 20 trades, 6 wins (30% win rate < 45%), net negative PnL
      const trades: BacktestTrade[] = [];
      for (let i = 0; i < 20; i++) {
        const isWin = i < 6;
        trades.push({
          id: `t-${i}`,
          strategyId: 'strat-bleeder',
          symbol: 'ETH/USDT',
          direction: 'BUY',
          entryPrice: 3000,
          exitPrice: isWin ? 3100 : 2900,
          size: 1,
          entryTime: 1700000000000 + i * 3600000,
          exitTime: 1700000000000 + i * 3600000 + 1800000,
          pnl: isWin ? 100 : -200, // Total: 6 * 100 - 14 * 200 = 600 - 2800 = -2200 < 0
          fees: 5,
        });
      }
      input.trades = trades;

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/persistent negative expectancy/i);
      expect(sm.isRetired()).toBe(true);
    });

    it('does not retire on negative PnL if sample size is under 15 trades', () => {
      const sm = new AlphaLifecycleStateMachine('strat-early', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // 10 trades, negative PnL
      const trades: BacktestTrade[] = [];
      for (let i = 0; i < 10; i++) {
        trades.push({
          id: `t-${i}`,
          strategyId: 'strat-early',
          symbol: 'SOL/USDT',
          direction: 'BUY',
          entryPrice: 100,
          exitPrice: 90,
          size: 1,
          entryTime: 1700000000000 + i * 3600000,
          exitTime: 1700000000000 + i * 3600000 + 1800000,
          pnl: -10,
          fees: 1,
        });
      }
      input.trades = trades;

      const result = sm.evaluate(input);

      // Not retired because trade count is only 10 (< 15)
      expect(result.state).toBe('PAPER_ACTIVE');
      expect(sm.isRetired()).toBe(false);
    });

    it('retires on out-of-sample consistency divergence (> 0.10)', () => {
      const sm = new AlphaLifecycleStateMachine('strat-oos-fail', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      input.valWinRate = 0.65;
      input.testWinRate = 0.52; // gap = 0.65 - 0.52 = 0.13 > 0.10

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/OOS consistency divergence/i);
      expect(sm.isRetired()).toBe(true);
    });

    it('evaluates retirement FIRST before promotion even if other metrics are exceptional', () => {
      const sm = new AlphaLifecycleStateMachine('strat-first', 'PAPER_ACTIVE');
      const input = makePassingGateInput();
      // Force severe drawdown breach into otherwise passing input
      input.equityCurve = [
        { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
        { timestamp: '2026-01-15T00:00:00.000Z', equity: 150000 },
        { timestamp: '2026-01-20T00:00:00.000Z', equity: 110000 }, // (150 - 110)/150 = 26.6% DD
      ];

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);
    });
  });

  describe('Absorbing RETIRED State', () => {
    it('remains RETIRED on subsequent evaluate() calls without transition', () => {
      const sm = new AlphaLifecycleStateMachine('strat-absorbing', 'RETIRED');
      const input = makePassingGateInput();

      const result = sm.evaluate(input);

      expect(result.state).toBe('RETIRED');
      expect(result.transition).toBeUndefined();
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);
      expect(sm.getHistory()).toHaveLength(0);
    });
  });

  describe('retire Method', () => {
    it('manually transitions to RETIRED from DISCOVERED', () => {
      const sm = new AlphaLifecycleStateMachine('strat-manual', 'DISCOVERED');
      const transition = sm.retire('Deprecated hypothesis by researcher');

      expect(sm.getState()).toBe('RETIRED');
      expect(transition.fromState).toBe('DISCOVERED');
      expect(transition.toState).toBe('RETIRED');
      expect(transition.reason).toBe('Deprecated hypothesis by researcher');
      expect(sm.isRetired()).toBe(true);
    });

    it('manually transitions to RETIRED from PROMOTED_LIVE_ELIGIBLE', () => {
      const sm = new AlphaLifecycleStateMachine('strat-demote', 'PROMOTED_LIVE_ELIGIBLE');
      const transition = sm.retire('Risk committee shutdown');

      expect(sm.getState()).toBe('RETIRED');
      expect(transition.fromState).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(transition.toState).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);
    });

    it('throws if retire() is called on an already RETIRED strategy', () => {
      const sm = new AlphaLifecycleStateMachine('strat-twice', 'RETIRED');
      expect(() => sm.retire('Shutdown again')).toThrow(/already RETIRED/i);
    });
  });

  describe('extractGateMetrics', () => {
    it('extracts all metrics correctly from GateEvaluatorInput', () => {
      const input = makePassingGateInput();
      const metrics = extractGateMetrics(input);

      expect(metrics.totalTrades).toBe(55);
      expect(metrics.tradeCount).toBe(55);
      expect(metrics.winRate).toBeGreaterThan(0.55);
      expect(metrics.profitFactor).toBeGreaterThan(1.3);
      expect(metrics.maxDrawdown).toBeLessThan(0.15);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
      expect(metrics.daysActive).toBeGreaterThanOrEqual(30);
      expect(metrics.oosGap).toBeCloseTo(0.02, 2);
      expect(metrics.totalNetPnl).toBeGreaterThan(0);
    });

    it('handles missing test/val win rates gracefully with null oosGap', () => {
      const input = makePassingGateInput();
      delete input.testWinRate;
      delete input.valWinRate;

      const metrics = extractGateMetrics(input);
      expect(metrics.oosGap).toBeNull();
    });
  });

  describe('mapStrategyStateToLifecycleState', () => {
    it('maps research exploration states to DISCOVERED', () => {
      const states: StrategyState[] = ['CANDIDATE', 'EVALUATED', 'BASELINE_GATE', 'WALK_FORWARD', 'SURVIVAL_GATE'];
      for (const st of states) {
        expect(mapStrategyStateToLifecycleState(st)).toBe('DISCOVERED');
      }
    });

    it('maps PAPER_APPROVED to PAPER_ACTIVE', () => {
      expect(mapStrategyStateToLifecycleState('PAPER_APPROVED')).toBe('PAPER_ACTIVE');
    });

    it('maps LIVE_APPROVED to PROMOTED_LIVE_ELIGIBLE', () => {
      expect(mapStrategyStateToLifecycleState('LIVE_APPROVED')).toBe('PROMOTED_LIVE_ELIGIBLE');
    });

    it('maps REJECTED to RETIRED', () => {
      expect(mapStrategyStateToLifecycleState('REJECTED')).toBe('RETIRED');
    });
  });
});
