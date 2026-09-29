import { describe, it, expect } from 'vitest';
import {
  createDefaultRegistry,
  createRegistry,
  experimentFromFamily,
  ALL_FAMILIES,
  prioritizeFamilies,
} from '../../../../src/alpha-lab/alpha-discovery';
import { classifyRegime, computeRegimeFeatures } from '../../../../src/alpha-lab/regimes';
import { evaluateWalkForward } from '../../../../src/alpha-lab/walkforward/walkforward-evaluator';
import { generateSplits } from '../../../../src/alpha-lab/experiments/splitter';
import { computeMetrics } from '../../../../src/desk/backtesting/metrics-calculator';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import { summarizeVerdicts } from '../../../../src/alpha-lab/provenance/verdict-summary';
import type { LedgerRecord } from '../../../../src/alpha-lab/provenance/research-ledger';
import { makeTrendUpCandles, makeRangeCandles, makeShockCandles } from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades } from '../fixtures/test-helpers';

export function registerTier2DiscoveryTests(): void {
  describe('Feature 1: Candidate Hypothesis Generation Boundaries (F1)', () => {
    it('B1.1: throws when querying unknown strategy family ID', () => {
      const registry = createDefaultRegistry();
      expect(() => experimentFromFamily(registry, { familyId: 'unknown', symbol: 'BTC/USDT', timeframe: '1h' })).toThrow('Unknown strategy family');
    });

    it('B1.2: clamps parameter overrides when passed extreme positive infinity', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h', paramOverrides: { breakoutLookback: Number.POSITIVE_INFINITY } });
      expect(config.lookback).toBe(100);
    });

    it('B1.3: clamps parameter overrides when passed extreme negative numbers', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h', paramOverrides: { breakoutLookback: -9999 } });
      expect(config.lookback).toBe(5);
    });

    it('B1.4: empty registry handles get and list safely', () => {
      const emptyRegistry = createRegistry([]);
      expect(emptyRegistry.list()).toEqual([]);
      expect(emptyRegistry.get('any')).toBeUndefined();
      expect(emptyRegistry.byCategory('momentum')).toEqual([]);
    });

    it('B1.5: handles tiebreaker deterministically when all families have identical pass rates', () => {
      const registry = createDefaultRegistry();
      const records: LedgerRecord[] = ALL_FAMILIES.map((f, i) => ({
        runId: `run-${i}`, configHash: `hash-${i}`, resultClass: 'OOS', strategyRef: f.id, recordedAt: '2025-01-01T00:00:00Z', gates: { g1: true }, prevHash: '',
      }));
      const summary = summarizeVerdicts(records);
      const ranked1 = prioritizeFamilies(registry, summary, { policy: 'validated-last' });
      const ranked2 = prioritizeFamilies(registry, summary, { policy: 'validated-last' });
      expect(ranked1.map((r) => r.familyId)).toEqual(ranked2.map((r) => r.familyId));
    });
  });

  describe('Feature 2: Walkforward Split & Evaluation Boundaries (F2)', () => {
    it('B2.1: throws Empty candle array error on empty input', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h' });
      expect(() => evaluateWalkForward({ candles: [], config })).toThrow('Empty candle array');
    });

    it('B2.2: throws Insufficient data error when candle count is less than lookback + maxHolding + 1', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h' });
      const minRequired = config.lookback + config.maxHolding + 1;
      expect(() => evaluateWalkForward({ candles: makeTrendUpCandles(minRequired - 1), config })).toThrow('Insufficient data');
    });

    it('B2.3: throws error on negative lookback in split generator', () => {
      expect(() => generateSplits({ mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 }, 100, -5)).toThrow();
    });

    it('B2.4: throws error when split ratios do not sum to 1.0', () => {
      expect(() => generateSplits({ mode: 'expanding', trainRatio: 0.5, valRatio: 0.2, testRatio: 0.1 }, 100, 10)).toThrow('Split ratios must sum to 1');
    });

    it('B2.5: handles candle series producing zero trades in test split without NaN crash', () => {
      const registry = createDefaultRegistry();
      const config = experimentFromFamily(registry, { familyId: 'momentum-breakout', symbol: 'BTC/USDT', timeframe: '1h' });
      const result = evaluateWalkForward({ candles: makeRangeCandles(120), config });
      expect(result.steps.length).toBeGreaterThan(0);
      for (const step of result.steps) {
        expect(step.testMetrics.numTrades).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(step.testMetrics.winRate)).toBe(false);
      }
    });
  });

  describe('Feature 3: Comprehensive Risk-Adjusted Metrics Boundaries (F3)', () => {
    it('B3.1: zero trades produces 0 total trades and 0 win rate without NaN', () => {
      const report = computeMetrics([], [{ timestamp: '2025-01-01T00:00:00Z', equity: 100000 }]);
      expect(report.totalTrades).toBe(0);
      expect(report.winRate).toBe(0);
      expect(report.sharpeRatio).toBe(0);
    });

    it('B3.2: single trade produces valid metrics without divide-by-zero crash', () => {
      const singleTrade = makeSyntheticTrades(1, 1.0, 500, 0);
      const curve = buildEquityCurve(makeTrendUpCandles(5).map((c) => ({ timestamp: c.timestamp })), singleTrade);
      const report = computeMetrics(singleTrade, curve);
      expect(report.totalTrades).toBe(1);
      expect(report.winningTrades).toBe(1);
      expect(Number.isNaN(report.winRate)).toBe(false);
    });

    it('B3.3: perfectly flat equity curve returns 0 Sharpe and 0 maxDrawdown without NaN', () => {
      const flatCurve = [{ timestamp: '2025-01-01T00:00:00Z', equity: 10000 }, { timestamp: '2025-01-02T00:00:00Z', equity: 10000 }];
      const report = computeMetrics([], flatCurve);
      expect(report.sharpeRatio).toBe(0);
      expect(report.maxDrawdown).toBe(0);
    });

    it('B3.4: all losing trades produces 0 profit factor and 0 win rate', () => {
      const losers = makeSyntheticTrades(10, 0.0, 0, -200);
      const curve = buildEquityCurve(makeTrendUpCandles(15).map((c) => ({ timestamp: c.timestamp })), losers);
      const report = computeMetrics(losers, curve);
      expect(report.winRate).toBe(0);
      expect(report.profitFactor).toBe(0);
      expect(report.losingTrades).toBe(10);
    });

    it('B3.5: single catastrophic 100% loss trade handled without throwing NaN', () => {
      const wipeoutTrade = makeSyntheticTrades(1, 0.0, 0, -10000);
      const curve = buildEquityCurve(makeTrendUpCandles(5).map((c) => ({ timestamp: c.timestamp })), wipeoutTrade);
      const report = computeMetrics(wipeoutTrade, curve);
      expect(Number.isNaN(report.totalPnl)).toBe(false);
      expect(report.totalPnl).toBeLessThan(0);
    });
  });

  describe('Feature 4: Multi-Regime Data Engine Boundaries (F4)', () => {
    it('B4.1: returns UNKNOWN regime with clean explanation on empty candles', () => {
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, []);
      expect(snapshot.regime).toBe('UNKNOWN');
      expect(snapshot.explanation).toBe('No candles provided');
      expect(snapshot.features.realizedVol).toBeNull();
      expect(snapshot.features.closeSlope).toBeNull();
    });

    it('B4.2: returns UNKNOWN on single candle input without crashing', () => {
      const single = makeTrendUpCandles(1);
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, single);
      expect(snapshot.regime).toBe('UNKNOWN');
      expect(snapshot.features.realizedVol).toBeNull();
    });

    it('B4.3: handles completely flat zero-variance candles without NaN or divide-by-zero', () => {
      const flat = Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 3600000).toISOString(),
        open: 50000, high: 50000, low: 50000, close: 50000, volume: 1000,
      }));
      const features = computeRegimeFeatures(flat);
      expect(features.realizedVol).toBe(0);
      expect(features.closeSlope).toBe(0);
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, flat);
      expect(snapshot.regime).toBe('LOW_VOLATILITY');
    });

    it('B4.4: triggers SHOCK regime on massive volume anomaly with return dispersion', () => {
      const shockCandles = makeShockCandles(30);
      const snapshot = classifyRegime({ market: 'BTC/USDT', timeframe: '1h', lookback: 20 }, shockCandles);
      expect(snapshot.regime).toBe('SHOCK');
      expect(snapshot.explanation).toContain('Extreme volume spike');
    });

    it('B4.5: handles zero or non-positive prices safely without crashing', () => {
      const bad = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 3600000).toISOString(),
        open: -10, high: 0, low: -20, close: 0, volume: 0,
      }));
      expect(computeRegimeFeatures(bad).realizedVol).toBeNull();
    });
  });
}
