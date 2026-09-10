/**
 * run-experiment CLI — Unit Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runExperimentCli } from '../run-experiment';
import type { ExperimentConfig } from '../experiments/experiment-types';

const { hoistedConfig, hoistedMetrics } = vi.hoisted(() => {
  const hoistedConfig: ExperimentConfig = {
    experimentId: 'exp-test-1',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    features: ['rsi_14'],
    tp: 0.02,
    sl: 0.01,
    split: { trainRatio: 0.7, valRatio: 0.15, testRatio: 0.15 },
    cost: { feeBps: 5, slippageBps: 2 },
    seed: 42,
    lookback: 20,
  };

  const hoistedMetrics = {
    numTrades: 10,
    winRate: 0.6,
    lossRate: 0.4,
    timeoutRate: 0.1,
    meanLabel: 0.01,
    totalPnl: 200,
    sharpeRatio: 1.5,
    maxDrawdown: 0.05,
  };

  return { hoistedConfig, hoistedMetrics };
});

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockImplementation((path: string) => {
    if (path === 'empty-features.json') {
      return JSON.stringify({ ...hoistedConfig, features: [''] });
    }
    return JSON.stringify(hoistedConfig);
  }),
}));

vi.mock('../experiments/alpha-backtest-adapter', () => ({
  loadCandles: vi.fn().mockResolvedValue({
    candles: [
      { timestamp: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { timestamp: 2, open: 11, high: 13, low: 10, close: 12, volume: 110 },
    ],
    source: 'synthetic',
  }),
  buildDataSources: vi.fn().mockReturnValue([
    { id: 'ds1', provider: 'test', type: 'candle', timeframe: '1h', transform: 'none' },
  ]),
}));

vi.mock('../experiments/experiment-engine', () => ({
  runExperiment: vi.fn().mockReturnValue({
    config: hoistedConfig,
    totalBars: 2,
    numSteps: 2,
    metrics: { train: hoistedMetrics, val: hoistedMetrics, test: hoistedMetrics },
  }),
}));

vi.mock('../baselines/baseline-runner', () => ({
  runAllBaselines: vi.fn().mockReturnValue([
    {
      name: 'buy_and_hold',
      report: {
        totalPnl: 100,
        winRate: 0.5,
        losingTrades: 5,
        totalTrades: 10,
        sharpeRatio: 1.1,
        maxDrawdown: 0.1,
      },
    },
  ]),
}));

vi.mock('../regimes/regime-series', () => ({
  computeRegimeSeries: vi.fn().mockReturnValue(['BULL', 'BEAR']),
  distinctRegimes: vi.fn().mockReturnValue(['BULL', 'BEAR']),
}));

vi.mock('../provenance/record-alpha-verdict', () => ({
  candidateResultFromExperiment: vi.fn().mockReturnValue({ candidateId: 'exp-test-1' }),
  recordAlphaVerdict: vi.fn().mockResolvedValue({
    ok: true,
    verdict: { passed: true },
    ledger: { ok: true },
  }),
}));

vi.mock('../provenance/run-card', () => ({
  hashConfig: vi.fn().mockReturnValue('hash123'),
}));

vi.mock('../run-experiment-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../run-experiment-helpers')>();
  return {
    ...actual,
    suggestFamilies: vi.fn().mockResolvedValue({
      summary: { totalRecords: 2, byStrategy: { s1: 2 } },
      suggestions: [
        { familyId: 'fam-accepted', score: 0.9, reason: 'untested' },
        { familyId: 'fam-demoted', score: 0.5, reason: 'passed-demoted' },
      ],
    }),
  };
});

describe('runExperimentCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs suggest-only mode when --suggest passed without --config', async () => {
    let stdout = '';
    let stderr = '';
    const io = {
      stdout: { write: (m: string) => { stdout += m; } },
      stderr: { write: (m: string) => { stderr += m; } },
    };

    const code = await runExperimentCli(['node', 'script', '--suggest'], io);
    expect(code).toBe(0);
    expect(stderr).toContain('[run-experiment] suggest: loading ledger');
    expect(stderr).toContain('2 families ranked');
    expect(stdout).toContain('fam-accepted');
  });

  it('runs standard experiment when --config is passed', async () => {
    let stdout = '';
    let stderr = '';
    const io = {
      stdout: { write: (m: string) => { stdout += m; } },
      stderr: { write: (m: string) => { stderr += m; } },
    };

    const code = await runExperimentCli(['node', 'script', '--config', 'config.json'], io);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    const parsed = JSON.parse(stdout) as { experimentId: string; metrics: { train: unknown } };
    expect(parsed.experimentId).toBe('exp-test-1');
    expect(parsed.metrics.train).toBeDefined();
  });

  it('records alpha verdict when --record is passed', async () => {
    let stdout = '';
    let stderr = '';
    const io = {
      stdout: { write: (m: string) => { stdout += m; } },
      stderr: { write: (m: string) => { stderr += m; } },
    };

    const code = await runExperimentCli(
      ['node', 'script', '--config', 'config.json', '--record'],
      io,
    );
    expect(code).toBe(0);
    expect(stderr).toContain('"recorded":true');
    expect(stderr).toContain('"alphaSurvival":true');
  });

  it('falls back to "experiment" when features produce an empty strategyRef string', async () => {
    let stderr = '';
    const io = {
      stdout: { write: () => {} },
      stderr: { write: (m: string) => { stderr += m; } },
    };

    const code = await runExperimentCli(
      ['node', 'script', '--config', 'empty-features.json', '--record'],
      io,
    );
    expect(code).toBe(0);
    expect(stderr).toContain('"recorded":true');
  });

  it('appends suggestedNext to artifact when --config and --suggest are combined', async () => {
    let stdout = '';
    let stderr = '';
    const io = {
      stdout: { write: (m: string) => { stdout += m; } },
      stderr: { write: (m: string) => { stderr += m; } },
    };

    const code = await runExperimentCli(
      ['node', 'script', '--config', 'config.json', '--suggest'],
      io,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as { suggestedNext?: string[] };
    expect(parsed.suggestedNext).toEqual(['fam-accepted']);
  });
});
