import { describe, it, expect } from 'vitest';
import { evaluateWalkForward } from '../../../../src/alpha-lab/walkforward/walkforward-evaluator';
import type { ExperimentConfig } from '../../../../src/alpha-lab/experiments/experiment-types';
import type { CandleLike } from '../../../../src/alpha-lab/regimes/regime-types';
import { computeRegimeSeries, distinctRegimes } from '../../../../src/alpha-lab/regimes/regime-series';
import { classifyRegime } from '../../../../src/alpha-lab/regimes/regime-engine';
import {
  snapToStep,
  sampleParamGrid,
  sampleParamRandom,
  generateFamilyCandidates,
} from '../../../../src/alpha-lab/alpha-discovery/candidate-generator';
import type { StrategyFamily } from '../../../../src/alpha-lab/alpha-discovery/strategy-family-types';
import { createDefaultRegistry, createRegistry } from '../../../../src/alpha-lab/alpha-discovery/strategy-family-registry';
import {
  generateMultiRegimeCandles,
  type RegimeSegmentConfig,
} from '../../../../src/alpha-lab/experiments/multi-regime-candle-generator';
import { evaluateAlphaSurvivalGate } from '../../../../src/alpha-lab/attribution/alpha-survival-gate';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSineCandles(n: number, basePrice = 100): CandleLike[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / 10) * Math.PI;
    const wave = Math.sin(angle) * 10;
    const close = Math.max(10, basePrice + wave + i * 0.1);
    const high = close + 2;
    const low = Math.max(1, close - 2);
    const open = close - 0.5;
    return {
      timestamp: new Date(Date.UTC(2025, 0, 1, i)).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 1000 + (i % 5) * 100,
    };
  });
}

const baseWfConfig: ExperimentConfig = {
  experimentId: 'challenger-stress-wf',
  hypothesis: 'empirical challenger lookahead stress test',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  features: ['simple_return'],
  regimes: 'all',
  tp: 0.02,
  sl: 0.01,
  maxHolding: 5,
  lookback: 5,
  split: {
    mode: 'rolling',
    trainRatio: 0.5,
    valRatio: 0.25,
    testRatio: 0.25,
    trainWindowSize: 20,
    valWindowSize: 10,
  },
  cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  seed: 42,
  gitCommit: 'challenger',
  createdAt: '2025-01-01T00:00:00Z',
};

// ── Suite 1: Causal Lookahead Boundary Invariance ─────────────────────────────

describe('Challenger Task 1: Causal Lookahead Boundary Invariance', () => {
  it('trainMetrics of step 0 are 100% bit-identical when future bars at/beyond trainSplit.endIdx are corrupted with extreme values', () => {
    // 60 candles base: train window is [lookback=5, endIdx=25)
    const clean = makeSineCandles(60);
    const cleanResult = evaluateWalkForward({ candles: clean, config: baseWfConfig });
    const step0 = cleanResult.steps[0]!;

    expect(step0.trainMetrics.numTrades).toBeGreaterThan(0);
    const trainEnd = 25;

    // Create corrupted candles where every bar at/beyond trainEnd has extreme wild price/volume swings
    const corrupted = clean.map((c, idx) => {
      if (idx >= trainEnd) {
        return {
          timestamp: c.timestamp,
          open: 999999999,
          high: 1000000000,
          low: 10,
          close: 888888888,
          volume: 1e12,
        };
      }
      return { ...c };
    });

    const corruptedResult = evaluateWalkForward({ candles: corrupted, config: baseWfConfig });
    const corruptedStep0 = corruptedResult.steps[0]!;

    // Train metrics must be 100% bit-identical
    expect(corruptedStep0.trainMetrics.numTrades).toBe(step0.trainMetrics.numTrades);
    expect(corruptedStep0.trainMetrics.winRate).toBe(step0.trainMetrics.winRate);
    expect(corruptedStep0.trainMetrics.lossRate).toBe(step0.trainMetrics.lossRate);
    expect(corruptedStep0.trainMetrics.timeoutRate).toBe(step0.trainMetrics.timeoutRate);
    expect(corruptedStep0.trainMetrics.meanLabel).toBe(step0.trainMetrics.meanLabel);
    expect(corruptedStep0.trainMetrics.totalPnl).toBe(step0.trainMetrics.totalPnl);
    expect(corruptedStep0.trainMetrics.sharpeRatio).toBe(step0.trainMetrics.sharpeRatio);
    expect(corruptedStep0.trainMetrics.profitFactor).toBe(step0.trainMetrics.profitFactor);
    expect(corruptedStep0.trainMetrics.maxDrawdown).toBe(step0.trainMetrics.maxDrawdown);
    expect(corruptedStep0.trainMetrics.regimesPresent).toEqual(step0.trainMetrics.regimesPresent);

    // Deep serialized comparison of train metrics
    expect(JSON.stringify(corruptedStep0.trainMetrics)).toBe(JSON.stringify(step0.trainMetrics));
  });

  it('valMetrics of step 0 are 100% bit-identical when future bars at/beyond valSplit.endIdx are corrupted with extreme values', () => {
    const clean = makeSineCandles(60);
    const cleanResult = evaluateWalkForward({ candles: clean, config: baseWfConfig });
    const step0 = cleanResult.steps[0]!;

    // Val window for step 0 is [25, 35)
    const valEnd = 35;

    const corrupted = clean.map((c, idx) => {
      if (idx >= valEnd) {
        return {
          timestamp: c.timestamp,
          open: 0.0001,
          high: 0.0002,
          low: 0.00005,
          close: 0.0001,
          volume: 999999999,
        };
      }
      return { ...c };
    });

    const corruptedResult = evaluateWalkForward({ candles: corrupted, config: baseWfConfig });
    const corruptedStep0 = corruptedResult.steps[0]!;

    expect(JSON.stringify(corruptedStep0.trainMetrics)).toBe(JSON.stringify(step0.trainMetrics));
    expect(JSON.stringify(corruptedStep0.valMetrics)).toBe(JSON.stringify(step0.valMetrics));
  });

  it('trainMetrics remain bit-identical and error-free even when future bars at trainSplit.endIdx contain NaN values', () => {
    const clean = makeSineCandles(60);
    const cleanResult = evaluateWalkForward({ candles: clean, config: baseWfConfig });
    const step0 = cleanResult.steps[0]!;
    const trainEnd = 25;

    // Poison future candles with NaN starting at trainSplit.endIdx
    const poisoned = clean.map((c, idx) => {
      if (idx >= trainEnd) {
        return {
          timestamp: c.timestamp,
          open: NaN,
          high: NaN,
          low: NaN,
          close: NaN,
          volume: NaN,
        };
      }
      return { ...c };
    });

    // In stepMetrics, candles.slice(0, split.endIdx) guarantees index 25 is never sliced
    // Causal train metrics must remain completely unaffected and free of NaN
    const poisonedResult = evaluateWalkForward({ candles: poisoned, config: baseWfConfig });
    const poisonedStep0 = poisonedResult.steps[0]!;

    expect(JSON.stringify(poisonedStep0.trainMetrics)).toBe(JSON.stringify(step0.trainMetrics));
    expect(Number.isNaN(poisonedStep0.trainMetrics.totalPnl)).toBe(false);
    expect(Number.isNaN(poisonedStep0.trainMetrics.sharpeRatio)).toBe(false);
  });

  it('proves that neither train nor val metrics leak any trades beyond their respective split end boundaries', () => {
    const candles = makeSineCandles(80);
    const result = evaluateWalkForward({ candles, config: baseWfConfig });
    const step0 = result.steps[0]!;

    // Train split: [5, 25). Max entryIdx possible is 25 - 1 - maxHolding(5) = 19
    // Max trades is 19 - 5 + 1 = 15
    expect(step0.trainMetrics.numTrades).toBeLessThanOrEqual(15);

    // Val split: [25, 35). Max entryIdx possible is 35 - 1 - 5 = 29
    // Max trades is 29 - 25 + 1 = 5
    expect(step0.valMetrics.numTrades).toBeLessThanOrEqual(5);
  });
});

// ── Suite 2: Parameter Sweep Edge Cases ───────────────────────────────────────

describe('Challenger Task 2: Parameter Sweep Edge Cases', () => {
  it('handles degenerate parameter bounds where min === max without division by zero or NaN', () => {
    // 1. snapToStep with min === max
    expect(snapToStep(5, 10, 10, 1)).toBe(10);
    expect(snapToStep(10, 10, 10, 1)).toBe(10);
    expect(snapToStep(15, 10, 10, 1)).toBe(10);

    // 2. sampleParamGrid with min === max
    const bounds = {
      window: { min: 20, max: 20, step: 1 },
      threshold: { min: 0.5, max: 0.5, step: 0.1 },
    };
    const defaults = { window: 20, threshold: 0.5 };

    const grid = sampleParamGrid(bounds, defaults, { stepsPerParam: 5, maxCombinations: 10 });
    expect(grid.length).toBe(1);
    expect(grid[0]).toEqual({ window: 20, threshold: 0.5 });
    expect(Number.isNaN(grid[0]!.window)).toBe(false);
    expect(Number.isNaN(grid[0]!.threshold)).toBe(false);

    // 3. sampleParamRandom with min === max
    const randomSamples = sampleParamRandom(bounds, defaults, 10, 123);
    expect(randomSamples.length).toBe(10);
    for (const sample of randomSamples) {
      expect(sample).toEqual({ window: 20, threshold: 0.5 });
    }
  });

  it('handles negative bounds and bounds spanning zero correctly', () => {
    // Negative bounds
    const negBounds = {
      spread: { min: -20, max: -5, step: 5 },
    };
    const negDefaults = { spread: -10 };

    expect(snapToStep(-12, -20, -5, 5)).toBe(-10);
    expect(snapToStep(-19, -20, -5, 5)).toBe(-20);
    expect(snapToStep(-4, -20, -5, 5)).toBe(-5);
    expect(snapToStep(-30, -20, -5, 5)).toBe(-20);

    const grid = sampleParamGrid(negBounds, negDefaults, { stepsPerParam: 4 });
    for (const item of grid) {
      expect(item.spread).toBeGreaterThanOrEqual(-20);
      expect(item.spread).toBeLessThanOrEqual(-5);
      expect(Number.isFinite(item.spread)).toBe(true);
    }

    const randomSamples = sampleParamRandom(negBounds, negDefaults, 15, 99);
    for (const item of randomSamples) {
      expect(item.spread).toBeGreaterThanOrEqual(-20);
      expect(item.spread).toBeLessThanOrEqual(-5);
      expect(Number.isFinite(item.spread)).toBe(true);
    }

    // Bounds spanning zero
    const spanBounds = {
      bias: { min: -5, max: 5, step: 2.5 },
    };
    const spanDefaults = { bias: 0 };
    const spanGrid = sampleParamGrid(spanBounds, spanDefaults, { stepsPerParam: 5 });
    for (const item of spanGrid) {
      expect(item.bias).toBeGreaterThanOrEqual(-5);
      expect(item.bias).toBeLessThanOrEqual(5);
    }
  });

  it('handles zero steps, negative steps, and zero stepsPerParam without crashing or infinite loops', () => {
    // snapToStep with step = 0
    expect(snapToStep(14.3, 10, 20, 0)).toBe(14.3);
    expect(snapToStep(5, 10, 20, 0)).toBe(10);
    expect(snapToStep(25, 10, 20, 0)).toBe(20);

    // snapToStep with negative step
    expect(snapToStep(14.3, 10, 20, -1)).toBe(14.3);

    // sampleParamGrid with step = 0 in bounds
    const bounds = {
      level: { min: 10, max: 20, step: 0 },
    };
    const defaults = { level: 15 };
    const gridWithZeroStep = sampleParamGrid(bounds, defaults, { stepsPerParam: 4 });
    expect(gridWithZeroStep.length).toBeGreaterThan(0);
    for (const item of gridWithZeroStep) {
      expect(Number.isFinite(item.level)).toBe(true);
      expect(item.level).toBeGreaterThanOrEqual(10);
      expect(item.level).toBeLessThanOrEqual(20);
    }

    // sampleParamGrid with stepsPerParam = 0
    const gridZeroSteps = sampleParamGrid(bounds, defaults, { stepsPerParam: 0 });
    expect(gridZeroSteps.length).toBeGreaterThan(0);
    expect(Number.isFinite(gridZeroSteps[0]!.level)).toBe(true);

    // sampleParamGrid with stepsPerParam = 1
    const gridOneStep = sampleParamGrid(bounds, defaults, { stepsPerParam: 1 });
    expect(gridOneStep.length).toBeGreaterThan(0);
    expect(Number.isFinite(gridOneStep[0]!.level)).toBe(true);
  });

  it('generates family candidates with a custom edge-case family configuration registered in registry', () => {
    const edgeFamily: StrategyFamily = {
      id: 'edge-family',
      name: 'Edge Family',
      description: 'Family with edge case bounds',
      category: 'momentum',
      features: ['simple_return'],
      entryRule: 'entry_test',
      exitRule: 'exit_test',
      positionSizing: 'fixed-fraction',
      defaultParams: { fixedParam: 100, zeroStepParam: 50, negParam: -10 },
      paramBounds: {
        fixedParam: { min: 100, max: 100, step: 1 },
        zeroStepParam: { min: 40, max: 60, step: 0 },
        negParam: { min: -20, max: -5, step: 5 },
      },
    };

    const registry = createRegistry([edgeFamily]);

    const candidates = generateFamilyCandidates(edgeFamily, registry, {
      symbol: 'ETH/USDT',
      timeframe: '15m',
      mode: 'grid',
      maxCandidatesPerFamily: 3,
      stepsPerParam: 3,
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3);

    for (const cand of candidates) {
      expect(cand.candidateId).toMatch(/^edge-family-ethusdt-15m-c\d+$/);
      expect(cand.params.fixedParam).toBe(100);
      expect(cand.params.zeroStepParam).toBeGreaterThanOrEqual(40);
      expect(cand.params.zeroStepParam).toBeLessThanOrEqual(60);
      expect(cand.params.negParam).toBeGreaterThanOrEqual(-20);
      expect(cand.params.negParam).toBeLessThanOrEqual(-5);
      expect(cand.experimentConfig.symbol).toBe('ETH/USDT');
      expect(cand.experimentConfig.timeframe).toBe('15m');
    }
  });
});

// ── Suite 3: Multi-Regime Candle Generator Extreme Length Stress ──────────────

describe('Challenger Task 3: Multi-Regime Candle Generator Extreme Lengths', () => {
  it('generates very short candle series (10 bars) and causally classifies regimes without NaN or crashes', () => {
    const shortSegments: RegimeSegmentConfig[] = [
      { regime: 'TREND_UP', bars: 5 },
      { regime: 'RANGE', bars: 5 },
    ];
    const candles = generateMultiRegimeCandles({ segments: shortSegments });

    expect(candles.length).toBe(10);
    for (const c of candles) {
      expect(Number.isFinite(c.open)).toBe(true);
      expect(Number.isFinite(c.high)).toBe(true);
      expect(Number.isFinite(c.low)).toBe(true);
      expect(Number.isFinite(c.close)).toBe(true);
      expect(Number.isFinite(c.volume)).toBe(true);
      expect(c.close).toBeGreaterThan(0);
      expect(c.high).toBeGreaterThanOrEqual(c.low);
    }

    // Classify regime series on 10 bars (even when lookback > 10)
    const regimes = computeRegimeSeries(candles, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 14,
    });

    expect(regimes.length).toBe(10);
    for (const reg of regimes) {
      expect(typeof reg).toBe('string');
      expect(reg.length).toBeGreaterThan(0);
    }
  });

  it('handles degenerate lengths (0, 1, 2 bars) gracefully', () => {
    // 0 bars
    const emptyCandles = generateMultiRegimeCandles({ segments: [] });
    expect(emptyCandles.length).toBe(0);

    const emptySnapshot = classifyRegime(
      { market: 'BTC/USDT', timeframe: '1h', lookback: 14 },
      emptyCandles,
    );
    expect(emptySnapshot.regime).toBe('UNKNOWN');
    expect(emptySnapshot.features.realizedVol).toBeNull();

    // 1 bar
    const oneCandle = generateMultiRegimeCandles({ segments: [{ regime: 'TREND_UP', bars: 1 }] });
    expect(oneCandle.length).toBe(1);
    const oneRegimes = computeRegimeSeries(oneCandle, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 14,
    });
    expect(oneRegimes.length).toBe(1);
    expect(oneRegimes[0]).toBe('UNKNOWN');

    // 2 bars
    const twoCandles = generateMultiRegimeCandles({ segments: [{ regime: 'TREND_UP', bars: 2 }] });
    expect(twoCandles.length).toBe(2);
    const twoRegimes = computeRegimeSeries(twoCandles, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 14,
    });
    expect(twoRegimes.length).toBe(2);
  });

  it('generates and processes an extreme length series of 10,000 bars without infinite loops, overflow, or NaN', () => {
    const t0 = Date.now();

    // Generate 10,000 bars across the 6 scheduled regimes
    const segments10k: RegimeSegmentConfig[] = [
      { regime: 'TREND_UP', bars: 1666 },
      { regime: 'RANGE', bars: 1666 },
      { regime: 'HIGH_VOLATILITY', bars: 1666 },
      { regime: 'SHOCK', bars: 1666 },
      { regime: 'TREND_DOWN', bars: 1666 },
      { regime: 'LOW_VOLATILITY', bars: 1670 },
    ];

    const candles = generateMultiRegimeCandles({ segments: segments10k, basePrice: 50000 });
    const genTimeMs = Date.now() - t0;

    expect(candles.length).toBe(10000);
    expect(genTimeMs).toBeLessThan(1000); // Must generate quickly

    // Spot-check samples across the 10,000 bars for mathematical sanity
    const checkIndices = [0, 500, 1665, 2000, 3332, 5000, 6664, 8000, 9999];
    for (const idx of checkIndices) {
      const c = candles[idx]!;
      expect(Number.isFinite(c.open)).toBe(true);
      expect(Number.isFinite(c.high)).toBe(true);
      expect(Number.isFinite(c.low)).toBe(true);
      expect(Number.isFinite(c.close)).toBe(true);
      expect(Number.isFinite(c.volume)).toBe(true);
      expect(c.close).toBeGreaterThan(0);
      expect(c.high).toBeGreaterThanOrEqual(c.low);
    }

    // Run causal regime classification on the 10,000 bars
    const tRegime0 = Date.now();
    const regimes = computeRegimeSeries(candles, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 20,
    });
    const regimeTimeMs = Date.now() - tRegime0;

    expect(regimes.length).toBe(10000);
    expect(regimeTimeMs).toBeLessThan(3000); // 10k bars processed in < 3s

    const distinct = distinctRegimes(regimes);
    // Must identify multiple distinct regimes in the 10k dataset
    expect(distinct.length).toBeGreaterThanOrEqual(4);
  });

  it('runs end-to-end walkforward evaluation on 1,000 multi-regime bars with finite non-NaN metrics', () => {
    const segments1k: RegimeSegmentConfig[] = [
      { regime: 'TREND_UP', bars: 200 },
      { regime: 'RANGE', bars: 200 },
      { regime: 'HIGH_VOLATILITY', bars: 200 },
      { regime: 'TREND_DOWN', bars: 200 },
      { regime: 'LOW_VOLATILITY', bars: 200 },
    ];
    const candles = generateMultiRegimeCandles({ segments: segments1k, basePrice: 50000 });
    expect(candles.length).toBe(1000);

    const wfConfig: ExperimentConfig = {
      ...baseWfConfig,
      split: {
        mode: 'rolling',
        trainRatio: 0.5,
        valRatio: 0.25,
        testRatio: 0.25,
        trainWindowSize: 100,
        valWindowSize: 50,
      },
    };

    const wfResult = evaluateWalkForward({ candles, config: wfConfig });

    expect(wfResult.steps.length).toBeGreaterThan(0);
    expect(Number.isFinite(wfResult.summary.testSharpe)).toBe(true);
    expect(Number.isFinite(wfResult.summary.testMaxDrawdown)).toBe(true);
    expect(Number.isFinite(wfResult.summary.testProfitFactor)).toBe(true);
    expect(Number.isFinite(wfResult.summary.testTotalPnl)).toBe(true);
    expect(Number.isFinite(wfResult.summary.regimeConsistencyScore)).toBe(true);
    expect(wfResult.summary.regimeConsistencyScore).toBeGreaterThanOrEqual(0);
    expect(wfResult.summary.regimeConsistencyScore).toBeLessThanOrEqual(1);

    // Evaluate through survival gate
    const gate = evaluateAlphaSurvivalGate({
      summary: wfResult.summary,
      trades: wfResult.allTestTrades,
    });
    expect(typeof gate.passed).toBe('boolean');
    expect(Number.isFinite(gate.conservativePnl)).toBe(true);
    expect(Number.isFinite(gate.adversePnl)).toBe(true);
  });
});
