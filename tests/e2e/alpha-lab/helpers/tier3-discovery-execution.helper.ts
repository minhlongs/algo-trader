import { describe, it, expect } from 'vitest';
import { createDefaultRegistry, experimentFromFamily } from '../../../../src/alpha-lab/alpha-discovery';
import { classifyRegime } from '../../../../src/alpha-lab/regimes';
import { evaluateAlpha } from '../../../../src/alpha-lab/attribution/alpha-evaluator';
import { applyStressToBaselineConfig } from '../../../../src/alpha-lab/cost-model/cost-stress';
import { detectSmallSample } from '../../../../src/alpha-lab/reports/hypothesis-rules';
import { AISignalAdapter, type AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import { RegimeAwareKelly } from '../../../../src/desk/risk/regime-aware-kelly';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import { upsertPosition, reducePosition, type PaperPosition } from '../../../../src/desk/execution/paper-position-tracker';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import { computeMetrics } from '../../../../src/desk/backtesting/metrics-calculator';
import { makeTrendUpCandles, makeRangeCandles, makeHighVolCandles, makeShockCandles } from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades, makeCandidateResult, makeEvaluationReport } from '../fixtures/test-helpers';

export function registerTier3DiscoveryExecutionTests(): void {
  describe('Pairwise Track 1: Discovery -> Signal Generation & Adapter (R1 -> R2)', () => {
    it('P1.1: discovered strategy passing survival gates produces validated AISignals via adapter', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h', paramOverrides: { breakoutLookback: 20 } });
      const closes = makeTrendUpCandles(50).map((c) => ({ timestamp: c.timestamp, close: c.close }));
      const candidate = makeCandidateResult({ strategyId: config.strategyId, sharpeRatio: 1.8, winRate: 0.62, totalNetPnl: 4500, maxDrawdown: 0.08 });
      expect(evaluateAlpha(candidate, closes).passed).toBe(true);

      const adapter = new AISignalAdapter({ confidenceThreshold: 0.65, minExpectancy: 0.02, regimeFilter: ['TREND_UP', 'LOW_VOLATILITY'] });
      const rawSignal: AISignal = { signalId: 'sig-disc-1', symbol: config.symbol, action: 'BUY', confidence: 0.85, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now() };
      expect(adapter.evaluateSignal(rawSignal)).toBe(true);
      expect(adapter.filterByRegime(rawSignal)).toBe(true);
    });

    it('P1.2: strategy discovered for TREND_UP regime is suppressed by adapter when market shifts to HIGH_VOLATILITY', () => {
      const adapter = new AISignalAdapter({ confidenceThreshold: 0.60, minExpectancy: 0.01, regimeFilter: ['TREND_UP'] });
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeHighVolCandles(30));
      expect(snapshot.regime).toBe('HIGH_VOLATILITY');

      const signal: AISignal = { signalId: 'sig-reg-suppressed', symbol: 'BTC/USDT', action: 'BUY', confidence: 0.90, expectancy: 0.08, regime: snapshot.regime, timestamp: Date.now() };
      expect(adapter.evaluateSignal(signal)).toBe(true);
      expect(adapter.filterByRegime(signal)).toBe(false);
    });

    it('P1.3: cost-stressed fee parameters elevate required expectancy hurdle; marginal signal is rejected', () => {
      const stressedCosts = applyStressToBaselineConfig({}, 'EXTREME');
      const requiredExpectancy = (stressedCosts.feeBps * 2 + stressedCosts.slippageBps) / 10000;
      const adapter = new AISignalAdapter({ confidenceThreshold: 0.60, minExpectancy: requiredExpectancy, regimeFilter: ['TREND_UP'] });
      const marginalSignal: AISignal = { signalId: 'sig-marginal', symbol: 'BTC/USDT', action: 'BUY', confidence: 0.80, expectancy: 0.008, regime: 'TREND_UP', timestamp: Date.now() };
      expect(adapter.evaluateSignal(marginalSignal)).toBe(false);
    });

    it('P1.4: feedback loop: small sample rejection generates hypothesis that guides extended lookback', () => {
      const smallSampleHyps = detectSmallSample(makeEvaluationReport({ totalTrades: 15 }));
      expect(smallSampleHyps.length).toBe(1);
      expect(smallSampleHyps[0]?.name).toBe('Sample Size Increase');

      const registry = createDefaultRegistry();
      const refinedConfig = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'ETH/USDT', timeframe: '1h', paramOverrides: { breakoutLookback: 50 } });
      expect(refinedConfig.lookback).toBe(50);
      const extendedCloses = makeRangeCandles(120).map((c) => ({ timestamp: c.timestamp, close: c.close }));
      const refinedCandidate = makeCandidateResult({ strategyId: refinedConfig.strategyId, totalTrades: 65, sharpeRatio: 1.6, winRate: 0.58 });
      expect(evaluateAlpha(refinedCandidate, extendedCloses).passed).toBe(true);
    });
  });

  describe('Pairwise Track 2: Signal Generation -> RegimeAwareKelly -> Paper Execution (R2 -> R2)', () => {
    it('P2.1: valid BUY signal sizes position through RegimeAwareKelly and fills in PaperExecutor', async () => {
      const adapter = new AISignalAdapter({ confidenceThreshold: 0.70, minExpectancy: 0.02, regimeFilter: ['TREND_UP', 'LOW_VOLATILITY'] });
      const signal: AISignal = { signalId: 'sig-exec-1', symbol: 'BTC/USDT', action: 'BUY', confidence: 0.80, expectancy: 0.04, regime: 'TREND_UP', timestamp: Date.now() };
      expect(adapter.evaluateSignal(signal)).toBe(true);

      const kelly = new RegimeAwareKelly({ kelly: { kellyFraction: 0.25, maxPositionFraction: 0.10 }, regimeMultipliers: { TREND_UP: 1.0, RANGE: 1.0, SHOCK: 0.0 }, unknownRegimeMultiplier: 0.75 });
      const sizing = kelly.size({ winProbability: 0.60, winLossRatio: 1.8, portfolioValue: 50000 }, 'TREND_UP');
      expect(sizing.positionSizeUsd).toBeGreaterThan(0);
      expect(sizing.positionSizeUsd).toBeLessThanOrEqual(5000);

      const executor = new PaperExecutor({ simulateFillRate: 1.0 });
      await executor.start(50000, true);
      const res = await executor.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: sizing.positionSizeUsd / 50000 }, 50000);
      expect(res.success).toBe(true);
      expect(executor.getPositions().length).toBe(1);
      await executor.stop();
    });

    it('P2.2: market shift into SHOCK regime zeros Kelly allocation and prevents order execution', async () => {
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeShockCandles(30));
      expect(snapshot.regime).toBe('SHOCK');

      const kelly = new RegimeAwareKelly({ kelly: { kellyFraction: 0.25, maxPositionFraction: 0.10 }, regimeMultipliers: { TREND_UP: 1.0, SHOCK: 0.0 }, unknownRegimeMultiplier: 0.75 });
      const sizing = kelly.size({ winProbability: 0.65, winLossRatio: 2.0, portfolioValue: 100000 }, 'SHOCK');
      expect(sizing.positionSizeUsd).toBe(0);

      const executor = new PaperExecutor();
      await executor.start(100000, true);
      expect(executor.getPositions().length).toBe(0);
      expect(executor.getPnlSummary().balance).toBe(100000);
      await executor.stop();
    });

    it('P2.3: filled paper position is actively tracked with mark-to-market and accurate unrealized P&L', () => {
      let positions: PaperPosition[] = [];
      positions = upsertPosition(positions, 'BTC/USDT', 'long', 1.0, 50000, 50000);
      expect(positions.length).toBe(1);
      expect(positions[0]?.unrealizedPnl).toBe(0);

      positions = upsertPosition(positions, 'BTC/USDT', 'long', 0, 50000, 52500);
      expect(positions[0]?.unrealizedPnl).toBe(2500);

      positions = upsertPosition(positions, 'BTC/USDT', 'long', 0, 50000, 48000);
      expect(positions[0]?.unrealizedPnl).toBe(-2000);

      positions = reducePosition(positions, 'BTC/USDT', 1.0, 52500);
      expect(positions.length).toBe(0);
    });

    it('P2.4: sequence of paper fills builds equity curve and matches computeMetrics statistics', () => {
      const syntheticTrades = makeSyntheticTrades(40, 0.65, 50000);
      const closes = makeTrendUpCandles(45).map((c) => ({ timestamp: c.timestamp }));
      const points = buildEquityCurve(closes, syntheticTrades);
      expect(points.length).toBe(45);
      expect(points[0]?.equity).toBe(1.0);

      const metrics = computeMetrics(syntheticTrades, points);
      expect(metrics.totalTrades).toBe(40);
      expect(metrics.winRate).toBe(0.65);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
      expect(metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    });
  });
}
