import { describe, it, expect } from 'vitest';
import { generateSplits, generateRollingSplits, Splitter } from '../splitter';
import type { SplitConfig } from '../experiment-types';

function makeConfig(overrides: Partial<SplitConfig> = {}): SplitConfig {
  return {
    mode: 'rolling',
    trainRatio: 0.5,
    valRatio: 0.25,
    testRatio: 0.25,
    ...overrides,
  };
}

describe('generateSplits', () => {
  const totalBars = 100;
  const lookback = 10;

  it('throws on ratios that do not sum to 1', () => {
    expect(() => generateSplits({ ...makeConfig(), trainRatio: 0.3, valRatio: 0.3, testRatio: 0.3 }, totalBars, lookback)).toThrow();
  });

  it('throws on ratio <= 0 or >= 1', () => {
    expect(() => generateSplits({ ...makeConfig(), trainRatio: 0 }, totalBars, lookback)).toThrow();
    expect(() => generateSplits({ ...makeConfig(), testRatio: 1 }, totalBars, lookback)).toThrow();
    expect(() =>
      generateSplits(
        { ...makeConfig(), trainRatio: 1.2, valRatio: -0.1, testRatio: -0.1 },
        totalBars,
        lookback,
      ),
    ).toThrow(/Split ratio must be in \(0,1\)/);
  });

  it('throws when explicit rolling window sizes exceed usable bars', () => {
    const config: SplitConfig = {
      mode: 'rolling',
      trainRatio: 0.5,
      valRatio: 0.25,
      testRatio: 0.25,
      trainWindowSize: 60,
      valWindowSize: 30,
    };
    // usable = 80 - 10 = 70; trainW(60) + valW(30) + testW(1) = 91 > 70
    expect(() => generateSplits(config, 80, 10)).toThrow(/Windows exceed usable data/);
  });

  it('throws on negative lookback', () => {
    expect(() => generateSplits(makeConfig(), totalBars, -1)).toThrow();
  });

  it('throws when totalBars <= lookback', () => {
    expect(() => generateSplits(makeConfig(), 5, 10)).toThrow();
  });

  it('throws when totalBars equals lookback', () => {
    expect(() => generateSplits(makeConfig(), 10, 10)).toThrow();
  });

  it('produces at least one step for sufficient data', () => {
    const splits = generateSplits(makeConfig(), totalBars, lookback);
    expect(splits.length).toBeGreaterThan(0);
  });

  it('all splits are contiguous with no gaps', () => {
    const splits = generateSplits(makeConfig(), totalBars, lookback);
    let prevEnd = lookback;
    for (const s of splits) {
      expect(s.startIdx).toBe(prevEnd);
      expect(s.endIdx).toBeGreaterThan(s.startIdx);
      prevEnd = s.endIdx;
    }
    expect(prevEnd).toBeLessThanOrEqual(totalBars);
  });

  it('first split starts at lookback', () => {
    const splits = generateSplits(makeConfig(), totalBars, lookback);
    expect(splits[0]?.startIdx).toBe(lookback);
  });

  it('last split ends at totalBars', () => {
    const splits = generateSplits(makeConfig(), totalBars, lookback);
    const last = splits[splits.length - 1];
    expect(last?.endIdx).toBe(totalBars);
  });

  it('preserves causal boundary: all startIdx >= lookback', () => {
    const splits = generateSplits(makeConfig(), totalBars, lookback);
    for (const s of splits) {
      expect(s.startIdx).toBeGreaterThanOrEqual(lookback);
    }
  });

  it('produces expanding mode with growing train window', () => {
    const splits = generateSplits(makeConfig({ mode: 'expanding' }), 200, 20);
    const trainSplits = splits.filter((s) => s.kind === 'train');
    for (let i = 1; i < trainSplits.length; i++) {
      const prev = trainSplits[i - 1]!.endIdx - trainSplits[i - 1]!.startIdx;
      const curr = trainSplits[i]!.endIdx - trainSplits[i]!.startIdx;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it('rolling mode advances by fixed test window', () => {
    const splits = generateSplits(makeConfig({ mode: 'rolling' }), 200, 20);
    const testSplits = splits.filter((s) => s.kind === 'test');
    for (let i = 1; i < testSplits.length; i++) {
      const prevStart = testSplits[i - 1]!.startIdx;
      const currStart = testSplits[i]!.startIdx;
      expect(currStart).toBeGreaterThan(prevStart);
    }
  });

  it('rolls off cleanly after data exhausted', () => {
    const splits = generateSplits(makeConfig({ mode: 'rolling' }), 200, 20);
    const last = splits[splits.length - 1];
    expect(last?.endIdx).toBeLessThanOrEqual(200);
  });

  it('supports explicit window sizes via rolling config', () => {
    const config: SplitConfig = {
      mode: 'rolling',
      trainRatio: 0.5,
      valRatio: 0.25,
      testRatio: 0.25,
      trainWindowSize: 50,
      valWindowSize: 25,
    };
    const splits = generateSplits(config, 200, 20);
    expect(splits.length).toBeGreaterThan(0);
  });

  it('throws on numFolds < 1', () => {
    expect(() => generateSplits(makeConfig({ numFolds: 0 }), totalBars, lookback)).toThrow(/numFolds must be >= 1/);
  });

  it('generates >= 5 rolling folds with numFolds: 5 without lookahead leakage', () => {
    const splits = generateSplits(makeConfig({ mode: 'rolling', numFolds: 5 }), 200, 20);
    const testSplits = splits.filter((s) => s.kind === 'test');
    expect(testSplits.length).toBeGreaterThanOrEqual(5);

    // Verify zero overlap in test periods and contiguous sequence
    for (let i = 1; i < testSplits.length; i++) {
      expect(testSplits[i]!.startIdx).toBe(testSplits[i - 1]!.endIdx);
    }

    // Verify causal boundary & no lookahead leakage within each step
    const steps = Math.max(...splits.map((s) => s.step)) + 1;
    for (let step = 0; step < steps; step++) {
      const train = splits.find((s) => s.step === step && s.kind === 'train')!;
      const val = splits.find((s) => s.step === step && s.kind === 'val')!;
      const test = splits.find((s) => s.step === step && s.kind === 'test')!;
      expect(train.startIdx).toBeGreaterThanOrEqual(20);
      expect(val.startIdx).toBe(train.endIdx);
      expect(test.startIdx).toBe(val.endIdx);
      expect(test.endIdx).toBeLessThanOrEqual(200);
    }
  });

  it('generateRollingSplits defaults to 5 folds and works via Splitter namespace', () => {
    const splits = generateRollingSplits(makeConfig(), 200, 20);
    const testSplits = splits.filter((s) => s.kind === 'test');
    expect(testSplits.length).toBeGreaterThanOrEqual(5);
    expect(Splitter.generateRollingSplits).toBe(generateRollingSplits);
  });
});