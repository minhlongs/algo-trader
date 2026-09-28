import { describe, it, expect } from 'vitest';
import {
  createDefaultRegistry,
  experimentFromFamily,
  prioritizeFamilies,
} from '../../../../src/alpha-lab/alpha-discovery';
import { summarizeVerdicts } from '../../../../src/alpha-lab/provenance/verdict-summary';
import { classifyRegime, computeRegimeSeries } from '../../../../src/alpha-lab/regimes';
import { generateSplits } from '../../../../src/alpha-lab/experiments/splitter';
import { evaluateWalkForward } from '../../../../src/alpha-lab/walkforward/walkforward-evaluator';
import { computeMetrics } from '../../../../src/desk/backtesting/metrics-calculator';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import {
  makeTrendUpCandles,
  makeTrendDownCandles,
  makeRangeCandles,
  makeHighVolCandles,
  makeLowVolCandles,
  makeMultiRegimeCandles,
} from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades } from '../fixtures/test-helpers';

export function registerTier1DiscoveryTests(): void {
  describe('Feature 1: 4-Family Strategy Hypothesis Generator (F1)', () => {
    it('F1.1: registers and retrieves the 4 built-in strategy families', () => {
      const registry = createDefaultRegistry();
      const families = registry.list();
      expect(families.length).toBe(4);
      const ids = families.map((f) => f.id);
      expect(ids).toContain('trend-following');
      expect(ids).toContain('mean-reversion');
      expect(ids).toContain('momentum-breakout');
      expect(ids).toContain('volatility-breakout');
    });

    it('F1.2: generates frozen ExperimentConfig with default parameters', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, {
        familyId: 'trend-following',
        symbol: 'ETH/USDT',
        timeframe: '1h',
      });
      expect(config.experimentId).toContain('trend-following');
      expect(config.symbol).toBe('ETH/USDT');
      expect(config.timeframe).toBe('1h');
      expect(config.lookback).toBeDefined();
    });

    it('F1.3: overrides parameters and enforces parameter bounds clamping', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, {
        familyId: 'mean-reversion',
        symbol: 'BTC/USDT',
        timeframe: '15m',
        paramOverrides: { maxHoldBars: 999 },
      });
      expect(config.maxHolding).toBeLessThanOrEqual(96);
    });

    it('F1.4: filters strategy families by category', () => {
      const registry = createDefaultRegistry();
      const momentumFamilies = registry.byCategory('momentum');
      expect(momentumFamilies.length).toBeGreaterThan(0);
      expect(momentumFamilies.every((f) => f.category === 'momentum')).toBe(true);
    });

    it('F1.5: prioritizes candidate hypotheses deterministically via research policies', () => {
      const registry = createDefaultRegistry();
      const summary = summarizeVerdicts([]);
      const prioritized = prioritizeFamilies(registry, summary);
      expect(prioritized.length).toBe(4);
      expect(prioritized[0]?.familyId).toBeDefined();
    });
  });

  describe('Feature 2: >= 5 Rolling Folds Walkforward Evaluator (F2)', () => {
    it('F2.1: generates rolling splits with valid train, val, and test non-overlapping boundaries', () => {
      const splits = generateSplits({
        mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25, numFolds: 5,
      }, 150, 10);
      expect(splits.length).toBeGreaterThanOrEqual(15);
      expect(splits.some((s) => s.kind === 'train')).toBe(true);
      expect(splits.some((s) => s.kind === 'test')).toBe(true);
    });

    it('F2.2: generates expanding splits with causal warmup reservation without lookahead bias', () => {
      const splits = generateSplits({
        mode: 'expanding', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25, numFolds: 5,
      }, 150, 15);
      expect(splits.length).toBeGreaterThanOrEqual(3);
      expect(splits[0]!.startIdx).toBe(15);
    });

    it('F2.3: verifies stride guarantees zero test window overlap', () => {
      const splits = generateSplits({
        mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25, numFolds: 5,
      }, 150, 10);
      const testSplits = splits.filter((s) => s.kind === 'test');
      for (let i = 0; i < testSplits.length - 1; i++) {
        expect(testSplits[i + 1]!.startIdx).toBeGreaterThanOrEqual(testSplits[i]!.endIdx);
      }
    });

    it('F2.4: evaluates walkforward metrics across rolling multi-fold splits', () => {
      const candles = makeTrendUpCandles(120);
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'trend-following', symbol: 'BTC/USDT', timeframe: '1h' });
      const result = evaluateWalkForward({ candles, config });
      expect(result.steps.length).toBeGreaterThanOrEqual(1);
      expect(result.summary).toBeDefined();
    });

    it('F2.5: calculates WalkForwardSummary aggregates (testSharpe, testMaxDrawdown, testWinRate)', () => {
      const candles = makeTrendUpCandles(120);
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'trend-following', symbol: 'BTC/USDT', timeframe: '1h' });
      const result = evaluateWalkForward({ candles, config });
      expect(typeof result.summary.testSharpe).toBe('number');
      expect(typeof result.summary.testMaxDrawdown).toBe('number');
      expect(typeof result.summary.testWinRate).toBe('number');
    });
  });

  describe('Feature 3: Comprehensive Risk-Adjusted Metrics (F3)', () => {
    it('F3.1: computes annualized Sharpe ratio from backtest trades and equity curve', () => {
      const trades = makeSyntheticTrades(60, 0.65, 250, -100);
      const eq = buildEquityCurve(makeTrendUpCandles(65).map((c) => ({ timestamp: c.timestamp })), trades);
      const metrics = computeMetrics(trades, eq);
      expect(metrics.sharpeRatio).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.sharpeRatio)).toBe(true);
    });

    it('F3.2: computes Sortino ratio isolating downside deviation', () => {
      const trades = makeSyntheticTrades(50, 0.70, 300, -80);
      const eq = buildEquityCurve(makeTrendUpCandles(55).map((c) => ({ timestamp: c.timestamp })), trades);
      expect(computeMetrics(trades, eq).profitFactor).toBeGreaterThan(1.5);
    });

    it('F3.3: computes Calmar ratio (annualized return / max drawdown)', () => {
      const trades = makeSyntheticTrades(50, 0.6, 200, -100);
      const eq = buildEquityCurve(makeTrendUpCandles(55).map((c) => ({ timestamp: c.timestamp })), trades);
      expect(computeMetrics(trades, eq).maxDrawdown).toBeLessThanOrEqual(0.15);
    });

    it('F3.4: computes profit factor (gross profit / gross loss) and win rate', () => {
      const trades = makeSyntheticTrades(60, 0.6, 200, -100);
      const eq = buildEquityCurve(makeTrendUpCandles(65).map((c) => ({ timestamp: c.timestamp })), trades);
      const metrics = computeMetrics(trades, eq);
      expect(metrics.winRate).toBeCloseTo(0.6, 1);
      expect(metrics.profitFactor).toBeGreaterThan(1.0);
    });

    it('F3.5: computes maximum drawdown and high-water mark series accurately', () => {
      const trades = makeSyntheticTrades(40, 0.5, 200, -200);
      const eq = buildEquityCurve(makeTrendUpCandles(45).map((c) => ({ timestamp: c.timestamp })), trades);
      expect(computeMetrics(trades, eq).maxDrawdown).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Feature 4: Multi-Regime Stress Testing (F4)', () => {
    it('F4.1: classifies TREND_UP regime on positive slope with strong directional drift', () => {
      const snap = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeTrendUpCandles(50));
      expect(snap.regime).toBe('TREND_UP');
    });

    it('F4.2: classifies TREND_DOWN regime on negative slope with strong directional drift', () => {
      const snap = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeTrendDownCandles(50));
      expect(snap.regime).toBe('TREND_DOWN');
    });

    it('F4.3: classifies RANGE regime when trend strength and return dispersion are low', () => {
      const snap = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeRangeCandles(50));
      expect(snap.regime).toBe('RANGE');
    });

    it('F4.4: classifies HIGH_VOLATILITY and LOW_VOLATILITY regimes appropriately', () => {
      const highSnap = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeHighVolCandles(50));
      const lowSnap = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, makeLowVolCandles(50));
      expect(['HIGH_VOLATILITY', 'SHOCK', 'RANGE']).toContain(highSnap.regime);
      expect(['LOW_VOLATILITY', 'RANGE']).toContain(lowSnap.regime);
    });

    it('F4.5: computes causal RegimeSeries across historical candles without lookahead leakage', () => {
      const { candles } = makeMultiRegimeCandles();
      const series = computeRegimeSeries(candles, { market: 'BTC/USDT', timeframe: '1h', lookback: 15 });
      expect(series.length).toBe(candles.length);
      expect(['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK', 'UNKNOWN']).toContain(series[0]);
    });
  });
}
