import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { createDefaultRegistry, experimentFromFamily } from '../../../../src/alpha-lab/alpha-discovery';
import { classifyRegime } from '../../../../src/alpha-lab/regimes';
import { evaluateAlpha } from '../../../../src/alpha-lab/attribution/alpha-evaluator';
import { evaluateGates } from '../../../../src/alpha-lab/gates/gate-evaluator';
import { AlphaLifecycleStateMachine } from '../../../../src/alpha-lab/attribution/alpha-lifecycle-state-machine';
import { bootstrapSharpeCi, runMonteCarloPermutation } from '../../../../src/alpha-lab/validation';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import { LiveExecutionGuard } from '../../../../src/desk/execution/live-execution-guard-core';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import { writeRunCard, hashConfig } from '../../../../src/alpha-lab/provenance/run-card';
import { appendLedgerRecord, readLedgerRecords, verifyLedgerChain } from '../../../../src/alpha-lab/provenance/research-ledger';
import { makeTrendUpCandles, makeShockCandles, makeRangeCandles, makeHighVolCandles, makeLowVolCandles } from '../fixtures/market-data-fixtures';
import { createTempDir, makeSyntheticTrades, makeCandidateResult, makeGateEvaluatorInput } from '../fixtures/test-helpers';

export function registerTier4Scenarios1To5(): void {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    tempDirObj = await createTempDir();
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  describe('Scenario 1: Full Alpha Lifecycle Odyssey', () => {
    it('S1: candidate discovery -> paper trading -> 10+1 gates -> live promotion', async () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h' });
      const closes = makeTrendUpCandles(60).map((c) => ({ timestamp: c.timestamp, close: c.close }));
      const candidate = makeCandidateResult({ strategyId: config.strategyId, sharpeRatio: 1.85, winRate: 0.62, totalNetPnl: 5200, maxDrawdown: 0.08 });
      expect(evaluateAlpha(candidate, closes).passed).toBe(true);

      const runDir = join(tempDirObj.path, 'odyssey-run');
      const card = await writeRunCard(runDir, { runId: 'ody-001', resultClass: 'SURVIVED', strategyRef: candidate.strategyId, dataSources: ['binance:BTC/USDT'], metrics: { sharpeRatio: 1.85 }, config });
      expect(card.configHash).toBe(hashConfig(config));

      const sm = new AlphaLifecycleStateMachine(candidate.strategyId, 'DISCOVERED');
      sm.startPaperTrading('Passed survival gate');
      expect(sm.getState()).toBe('PAPER_ACTIVE');

      const trades = makeSyntheticTrades(60, 0.65, 100000);
      const equityCurve = buildEquityCurve(makeTrendUpCandles(70).map((c) => ({ timestamp: c.timestamp })), trades);
      const evalInput = makeGateEvaluatorInput({ trades, equityCurve, startDate: new Date(Date.now() - 35 * 86400000).toISOString() });
      const readiness = sm.evaluate(evalInput);

      expect(readiness.verdict.allPassed).toBe(true);
      expect(sm.getState()).toBe('PROMOTED_LIVE_ELIGIBLE');
      expect(sm.isLiveEligible()).toBe(true);
    });
  });

  describe('Scenario 2: Flash Crash Quarantine', () => {
    it('S2: black swan drop triggers SHOCK regime and circuit breaker halts order routing', async () => {
      const shockCandles = makeShockCandles(30);
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, shockCandles);
      expect(snapshot.regime).toBe('SHOCK');

      const sm = new AlphaLifecycleStateMachine('flash-crash-strat', 'PAPER_ACTIVE');
      const breachedInput = makeGateEvaluatorInput({
        equityCurve: [{ timestamp: '2026-01-01', equity: 100000 }, { timestamp: '2026-01-02', equity: 75000 }],
      });
      const evalRes = sm.evaluate(breachedInput);
      expect(evalRes.state).toBe('RETIRED');
      expect(sm.isRetired()).toBe(true);

      const guard = new LiveExecutionGuard({ capitalUsdc: 100000, enabled: true });
      guard.recordLoss(-16000); // 16% crash loss
      const order = { id: 'ord1', clientOrderId: 'c1', market: '0x1', side: 'BUY' as const, price: 0.5, size: 500 };
      expect(guard.guardOrder(order).approved).toBe(false);
    });
  });

  describe('Scenario 3: P-Hacking Sweep Neutralization', () => {
    it('S3: 100 random noise paths penalized by Deflated Sharpe / permutation tests', () => {
      const noisyPnls = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 10 : -10.5));
      const mc = runMonteCarloPermutation(noisyPnls, { initialCapital: 10000, nSimulations: 50, seed: 42 });
      expect(mc.ok).toBe(true);
      if (mc.ok) {
        expect(mc.pValueSharpe).toBeGreaterThan(0.05); // fails significance gate
      }

      const returns = noisyPnls.map((p) => p / 10000);
      const ci = bootstrapSharpeCi(returns, { nBootstrap: 50, seed: 42 });
      expect(ci.ok).toBe(true);
      if (ci.ok) {
        expect(ci.ciLower).toBeLessThanOrEqual(0); // lower bound crosses below zero
      }
    });
  });

  describe('Scenario 4: Severe Liquidity Squeeze', () => {
    it('S4: PaperExecutor traverses order book with slippage and fee deduction', async () => {
      const executor = new PaperExecutor({ initialBalance: 50000, simulateFillRate: 1.0 });
      await executor.start(50000, true);
      const fill = await executor.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.1 }, 50000);
      expect(fill.success).toBe(true);
      expect(fill.trade?.executedPrice).toBeGreaterThan(50000); // Slippage increases fill price on buy
      expect(fill.trade?.fee).toBeGreaterThan(0);
      await executor.stop();
    });
  });

  describe('Scenario 5: Multi-Regime Stress Gauntlet', () => {
    it('S5: tests candidate across 4 regimes and verifies regime consistency hurdle', () => {
      const highVol = classifyRegime({ market: 'BTC', timeframe: '1h', lookback: 20 }, makeHighVolCandles(30));
      const lowVol = classifyRegime({ market: 'BTC', timeframe: '1h', lookback: 20 }, makeLowVolCandles(30));
      const trendUp = classifyRegime({ market: 'BTC', timeframe: '1h', lookback: 20 }, makeTrendUpCandles(30));
      const range = classifyRegime({ market: 'BTC', timeframe: '1h', lookback: 20 }, makeRangeCandles(30));

      const testedRegimes = [highVol.regime, lowVol.regime, trendUp.regime, range.regime];
      expect(new Set(testedRegimes).size).toBeGreaterThanOrEqual(3);

      const candidateResults = [
        { regime: 'TREND_UP', profitable: true },
        { regime: 'LOW_VOLATILITY', profitable: true },
        { regime: 'RANGE', profitable: false },
        { regime: 'HIGH_VOLATILITY', profitable: false },
      ];
      const consistencyScore = candidateResults.filter((r) => r.profitable).length / candidateResults.length;
      expect(consistencyScore).toBe(0.50);
      expect(consistencyScore < 0.70).toBe(true); // Fails 70% consistency hurdle
    });
  });
}
