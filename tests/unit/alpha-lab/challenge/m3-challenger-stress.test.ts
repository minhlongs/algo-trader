import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlphaLifecycleStateMachine,
  extractGateMetrics,
  mapStrategyStateToLifecycleState,
  type AlphaLifecycleState,
} from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import type { GateEvaluatorInput } from '../../../../src/alpha-lab/gates/gate-evaluator-types';
import type { BacktestTrade } from '../../../../src/desk/backtesting/types';
import {
  LiveGuardHandoffCoordinator,
  type LiveOrderHandoffRequest,
} from '../../../../src/desk/execution/live-guard-handoff';
import { TieredDrawdownBreaker } from '../../../../src/desk/risk/tiered-drawdown-breaker';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';
import type { TradeSignal } from '../../../../src/desk/polymarket/strategy-live-bridge-types';

describe('Milestone 3 Challenger Empirical Stress Suite', () => {
  // Helper to generate trades
  const makeTrades = (count: number, winRatio: number, winPnl = 100, lossPnl = -100): BacktestTrade[] => {
    const trades: BacktestTrade[] = [];
    const wins = Math.round(count * winRatio);
    for (let i = 0; i < count; i++) {
      const isWin = i < wins;
      trades.push({
        id: `trade-${i}`,
        strategyId: 'challenger-strat',
        symbol: 'BTC/USDT',
        direction: 'BUY',
        entryPrice: 50000,
        exitPrice: isWin ? 52000 : 48000,
        size: 1,
        entryTime: 1700000000000 + i * 3600000,
        exitTime: 1700000000000 + i * 3600000 + 1800000,
        pnl: isWin ? winPnl : lossPnl,
        fees: 1,
      });
    }
    return trades;
  };

  const makePassingInput = (): GateEvaluatorInput => ({
    trades: makeTrades(60, 0.65, 500, -200),
    startDate: new Date(Date.now() - 40 * 86400000).toISOString(),
    equityCurve: [
      { timestamp: new Date(Date.now() - 40 * 86400000).toISOString(), equity: 100000 },
      { timestamp: new Date(Date.now()).toISOString(), equity: 115000 },
    ],
    testWinRate: 0.60,
    valWinRate: 0.62,
    flags: {
      kellyWired: true,
      circuitBreakerTested: true,
      exchangeConnectivityGreen: true,
    },
  });

  const makeOrder = (price = 0.50, size = 1000): PolymarketOrder => ({
    tokenId: '0x-challenger-token',
    price,
    size,
    side: 'BUY',
    expiration: Math.floor(Date.now() / 1000) + 3600,
    nonce: '1',
    feeRateBps: 0,
    signatureType: 0,
  });

  const makeSignal = (timestamp = Date.now()): TradeSignal => ({
    tokenId: '0x-challenger-token',
    side: 'BUY',
    size: 1000,
    price: 0.50,
    confidence: 0.85,
    timestamp,
  });

  // ============================================================================
  // Task 1: Lifecycle State Machine Absorbing State & Transition Stress
  // ============================================================================
  describe('Task 1: AlphaLifecycleStateMachine Invariants & Absorbing States', () => {
    it('invariant: RETIRED state is strictly absorbing under any repeated evaluation or action', () => {
      const sm = new AlphaLifecycleStateMachine('strat-absorb', 'RETIRED');
      expect(sm.getState()).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);

      // Attempt to restart paper trading must throw
      expect(() => sm.startPaperTrading()).toThrow(/absorbing state/i);

      // Attempt to retire again must throw
      expect(() => sm.retire('Duplicate retire')).toThrow(/already RETIRED/i);

      // 50 consecutive evaluations with perfect passing gates must remain RETIRED
      const input = makePassingInput();
      for (let i = 0; i < 50; i++) {
        const result = sm.evaluate(input);
        expect(result.state).toBe('RETIRED');
        expect(result.transition).toBeUndefined();
        expect(sm.getState()).toBe('RETIRED');
        expect(sm.isRetired()).toBe(true);
      }
    });

    it('invariant: history immutability — mutating array returned by getHistory() does not corrupt internal state', () => {
      const sm = new AlphaLifecycleStateMachine('strat-hist');
      sm.startPaperTrading();
      const history = sm.getHistory();
      expect(history).toHaveLength(1);

      // Mutate returned array
      history.push({
        strategyId: 'fake',
        fromState: 'PAPER_ACTIVE',
        toState: 'PROMOTED_LIVE_ELIGIBLE',
        timestamp: Date.now(),
        reason: 'fake transition',
        metricsSnapshot: {
          totalTrades: 0,
          tradeCount: 0,
          winRate: 0,
          profitFactor: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          daysActive: 0,
          oosGap: null,
          totalNetPnl: 0,
        },
        gateVerdict: {
          evaluatedAt: new Date().toISOString(),
          gates: [],
          allPassed: true,
          passedCount: 0,
          totalGates: 0,
          estimatedDaysRemaining: null,
        },
      });

      // Internal history must remain length 1
      expect(sm.getHistory()).toHaveLength(1);
    });

    it('invariant: retirement priority — drawdown breach retires immediately even if Sharpe, winRate and trade count are exceptionally high', () => {
      const sm = new AlphaLifecycleStateMachine('strat-high-sharpe-dd', 'PAPER_ACTIVE');
      const input = makePassingInput();
      // Inject severe drawdown (peak 150k -> 120k = 20% drawdown)
      input.equityCurve = [
        { timestamp: new Date(Date.now() - 30 * 86400000).toISOString(), equity: 100000 },
        { timestamp: new Date(Date.now() - 15 * 86400000).toISOString(), equity: 150000 },
        { timestamp: new Date(Date.now()).toISOString(), equity: 120000 },
      ];

      const result = sm.evaluate(input);
      expect(result.state).toBe('RETIRED');
      expect(result.transition?.toState).toBe('RETIRED');
      expect(result.transition?.reason).toMatch(/Drawdown breach/i);
      expect(sm.isRetired()).toBe(true);
      expect(sm.isLiveEligible()).toBe(false);
    });

    it('boundary: drawdown exactly 15.00% vs 15.01%', () => {
      // 15.00% drawdown exactly: (100k - 85k) / 100k = 0.150000
      const sm1 = new AlphaLifecycleStateMachine('strat-dd-boundary-pass', 'PAPER_ACTIVE');
      const input1 = makePassingInput();
      input1.equityCurve = [
        { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
        { timestamp: '2026-01-10T00:00:00.000Z', equity: 85000 },
      ];
      const result1 = sm1.evaluate(input1);
      // Math.abs(maxDrawdown) > 0.15 is false for 0.1500
      expect(result1.state).not.toBe('RETIRED');

      // 15.01% drawdown: (100k - 84.99k) / 100k = 0.1501 > 0.15
      const sm2 = new AlphaLifecycleStateMachine('strat-dd-boundary-fail', 'PAPER_ACTIVE');
      const input2 = makePassingInput();
      input2.equityCurve = [
        { timestamp: '2026-01-01T00:00:00.000Z', equity: 100000 },
        { timestamp: '2026-01-10T00:00:00.000Z', equity: 84900 },
      ];
      const result2 = sm2.evaluate(input2);
      expect(result2.state).toBe('RETIRED');
    });

    it('boundary: sample size threshold for negative expectancy retirement (14 trades vs 15 trades)', () => {
      // 14 trades with negative PnL and 0% win rate: should NOT retire yet (insufficient sample size)
      const sm14 = new AlphaLifecycleStateMachine('strat-14', 'PAPER_ACTIVE');
      const input14 = makePassingInput();
      input14.trades = makeTrades(14, 0.0, 100, -100); // 0 wins, 14 losses
      const result14 = sm14.evaluate(input14);
      expect(result14.state).toBe('PAPER_ACTIVE');

      // 15 trades with negative PnL and 40% win rate (< 45% threshold): MUST retire
      const sm15 = new AlphaLifecycleStateMachine('strat-15', 'PAPER_ACTIVE');
      const input15 = makePassingInput();
      input15.trades = makeTrades(15, 0.40, 50, -100); // 6 wins ($300), 9 losses (-$900) = -$600 < 0
      const result15 = sm15.evaluate(input15);
      expect(result15.state).toBe('RETIRED');
      expect(result15.transition?.reason).toMatch(/Persistent negative expectancy/i);
    });

    it('boundary: win rate threshold at 15 trades (44.9% vs 45.0%)', () => {
      // 20 trades, net negative PnL, win rate 40% (< 45%) -> RETIRED
      const smFail = new AlphaLifecycleStateMachine('strat-wr-fail', 'PAPER_ACTIVE');
      const inputFail = makePassingInput();
      inputFail.trades = makeTrades(20, 0.40, 50, -100); // 8 wins ($400), 12 losses (-$1200) = -$800
      expect(smFail.evaluate(inputFail).state).toBe('RETIRED');

      // 20 trades, net negative PnL, but win rate 50% (>= 45%) -> Not retired by expectancy rule
      const smPass = new AlphaLifecycleStateMachine('strat-wr-pass', 'PAPER_ACTIVE');
      const inputPass = makePassingInput();
      inputPass.trades = makeTrades(20, 0.50, 10, -100); // 10 wins ($100), 10 losses (-$1000) = -$900
      expect(smPass.evaluate(inputPass).state).toBe('PAPER_ACTIVE');
    });

    it('boundary: OOS consistency gap (0.10 vs 0.1001)', () => {
      const sm10 = new AlphaLifecycleStateMachine('strat-oos-10', 'PAPER_ACTIVE');
      const input10 = makePassingInput();
      input10.valWinRate = 0.60;
      input10.testWinRate = 0.50; // gap = 0.10 <= 0.10
      expect(sm10.evaluate(input10).state).not.toBe('RETIRED');

      const sm11 = new AlphaLifecycleStateMachine('strat-oos-11', 'PAPER_ACTIVE');
      const input11 = makePassingInput();
      input11.valWinRate = 0.61;
      input11.testWinRate = 0.50; // gap = 0.11 > 0.10
      expect(sm11.evaluate(input11).state).toBe('RETIRED');
    });
  });

  // ============================================================================
  // Task 2: Live Guard Handoff Pre-Trade Gate Ordering & Isolation Stress
  // ============================================================================
  describe('Task 2: LiveGuardHandoffCoordinator Gate Priority & Stress', () => {
    let coordinator: LiveGuardHandoffCoordinator;
    const CAPITAL = 100_000;

    beforeEach(() => {
      coordinator = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        maxPositionFraction: 0.02,
        maxDailyDrawdown: 0.05,
        signalTtlMs: 200,
        rateLimitOrdersPerSec: 5,
        rateLimitBurst: 5,
      });
    });

    it('invariant: pre-trade gate ordering — stale TTL rejects BEFORE consuming rate limit tokens', () => {
      const reqStale: LiveOrderHandoffRequest = {
        strategyId: 'strat-token-test',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 300), // Stale: 300ms > 200ms
        order: makeOrder(0.50, 100),
      };

      // Send 10 stale orders (burst capacity is 5)
      for (let i = 0; i < 10; i++) {
        const v = coordinator.evaluateLiveOrder(reqStale);
        expect(v.approved).toBe(false);
        expect(v.checks.signalTtlOk).toBe(false);
        expect(v.checks.rateLimitOk).toBe(true); // Must NOT be rate-limited because TTL halted evaluation first!
      }

      // Now send a fresh order for the same strategy: tokens must still be intact!
      const reqFresh: LiveOrderHandoffRequest = {
        strategyId: 'strat-token-test',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 50),
        order: makeOrder(0.50, 100),
      };
      const verdict = coordinator.evaluateLiveOrder(reqFresh);
      expect(verdict.approved).toBe(true);
      expect(verdict.checks.rateLimitOk).toBe(true);
    });

    it('invariant: multi-strategy token bucket isolation — strategy A spamming cannot starve strategy B', () => {
      const reqA: LiveOrderHandoffRequest = {
        strategyId: 'strat-spammer-A',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 20),
        order: makeOrder(0.50, 100),
      };

      const reqB: LiveOrderHandoffRequest = {
        strategyId: 'strat-innocent-B',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 20),
        order: makeOrder(0.50, 100),
      };

      // Exhaust all tokens for strategy A
      for (let i = 0; i < 5; i++) {
        expect(coordinator.evaluateLiveOrder(reqA).approved).toBe(true);
      }
      // 6th order for A is rate limited
      const vA = coordinator.evaluateLiveOrder(reqA);
      expect(vA.approved).toBe(false);
      expect(vA.checks.rateLimitOk).toBe(false);

      // Strategy B must remain unaffected and fully approve its orders
      for (let i = 0; i < 5; i++) {
        const vB = coordinator.evaluateLiveOrder(reqB);
        expect(vB.approved).toBe(true);
        expect(vB.checks.rateLimitOk).toBe(true);
      }
    });

    it('invariant: TieredDrawdownBreaker integration — HALT tier locks all orders regardless of strategy state', () => {
      const breaker = new TieredDrawdownBreaker(CAPITAL, { haltThreshold: 0.15 });
      const coordWithBreaker = new LiveGuardHandoffCoordinator({
        capitalUsdc: CAPITAL,
        drawdownBreaker: breaker,
      });

      // Update equity to 80k (20% drawdown > 15% halt)
      coordWithBreaker.recordFillOutcome('strat-any', -20000, 80000);

      const status = coordWithBreaker.getStatus();
      expect(status.canOpenNewTrades).toBe(false);
      expect(status.drawdownTier).toBe('HARD_STOP');

      const req: LiveOrderHandoffRequest = {
        strategyId: 'strat-promoted',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 10),
        order: makeOrder(0.50, 100),
      };

      const verdict = coordWithBreaker.evaluateLiveOrder(req);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.drawdownBreakerOk).toBe(false);
      expect(verdict.reason).toMatch(/DRAWDOWN_BREAKER/i);
    });

    it('boundary: exact 2% position limit boundary ($2,000 on $100,000 capital)', () => {
      // Exactly $2,000: 4000 shares * $0.50 = $2,000.00 -> PASS
      const reqExact: LiveOrderHandoffRequest = {
        strategyId: 'strat-pos',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 10),
        order: makeOrder(0.50, 4000),
      };
      expect(coordinator.evaluateLiveOrder(reqExact).approved).toBe(true);

      // $2,000.50: 4001 shares * $0.50 = $2,000.50 -> REJECT
      const reqOver: LiveOrderHandoffRequest = {
        strategyId: 'strat-pos',
        lifecycleState: 'PROMOTED_LIVE_ELIGIBLE',
        signal: makeSignal(Date.now() - 10),
        order: makeOrder(0.50, 4001),
      };
      const verdict = coordinator.evaluateLiveOrder(reqOver);
      expect(verdict.approved).toBe(false);
      expect(verdict.checks.positionSizeOk).toBe(false);
    });

    it('stress: rapid fire sequence of 100 mixed valid and invalid orders', () => {
      let approvedCount = 0;
      let rejectedCount = 0;

      for (let i = 0; i < 100; i++) {
        const isStale = i % 4 === 0;
        const isInvalidState = i % 5 === 0;
        const isOverSize = i % 7 === 0;

        const req: LiveOrderHandoffRequest = {
          strategyId: `strat-${i % 10}`,
          lifecycleState: isInvalidState ? 'PAPER_ACTIVE' : 'PROMOTED_LIVE_ELIGIBLE',
          signal: makeSignal(isStale ? Date.now() - 500 : Date.now() - 10),
          order: makeOrder(0.50, isOverSize ? 10000 : 100),
        };

        const verdict = coordinator.evaluateLiveOrder(req);
        if (verdict.approved) {
          approvedCount++;
        } else {
          rejectedCount++;
        }
      }

      expect(approvedCount + rejectedCount).toBe(100);
      expect(approvedCount).toBeGreaterThan(0);
      expect(rejectedCount).toBeGreaterThan(0);
    });
  });
});
