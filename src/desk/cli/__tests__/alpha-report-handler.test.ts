/**
 * Tests for alpha-report-handler.handleReport.
 *
 * loadConfigByName, loadCandlesForConfig and runExperiment are stubbed so
 * handleReport drives the real evaluation pipeline (buildTrades / batchLabel /
 * buildEquityCurve / computeRegimeSeries / evaluate) on deterministic candles.
 * That exercises alpha-report-handler's 45 statements under the in-memory
 * fake — the real handler needs a config JSON on disk.
 *
 * Mock paths are relative to __tests__/ (same as alpha-cli.test.ts), so the
 * dynamic imports inside handleReport resolve against the real modules while
 * the top-level alpha-helpers + experiment-engine mocks keep us hermetic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExperimentConfig } from '../../../alpha-lab/experiments/experiment-types';
import type { CandleLike } from '../../../alpha-lab/regimes/regime-types';

const { mockLoadConfigByName, mockRunExperiment, loggerInfo, mockWriteOutput, makeCandles } = vi.hoisted(() => {
  const logs: Array<{ msg: string; ctx?: unknown }> = [];
  const candles: CandleLike[] = [];
  for (let i = 0; i < 400; i++) {
    const close = 100 + Math.sin(i / 10) * 2 + i * 0.001;
    candles.push({ timestamp: new Date(Date.UTC(2024, 0, 1, i)).toISOString(), open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 + i });
  }
  return {
    mockLoadConfigByName: vi.fn(),
    mockRunExperiment: vi.fn(),
    mockWriteOutput: vi.fn(),
    loggerInfo: vi.fn((msg: string, ctx?: unknown) => logs.push({ msg, ctx })),
    logs,
    makeCandles: () => candles,
  };
});

vi.mock('../../../shared/utils/logger', () => ({ logger: { debug: vi.fn(), info: loggerInfo, warn: vi.fn(), error: vi.fn() } }));

vi.mock('../alpha-helpers', () => ({
  loadConfigByName: mockLoadConfigByName,
  loadCandlesForConfig: vi.fn(async () => ({
    candles: makeCandles(),
    source: 'mock',
    dataSources: [{ provider: 'mock', symbol: 'BTC/USD', timeframe: '1h', retrievedAt: new Date() }],
  })),
  writeOutput: mockWriteOutput,
  printTable: vi.fn(),
}));

vi.mock('../../../alpha-lab/experiments/experiment-engine', () => ({
  runExperiment: mockRunExperiment,
}));

// real modules used via dynamic import inside handleReport
import { loadConfigByName } from '../alpha-helpers';
import { runExperiment } from '../../../alpha-lab/experiments/experiment-engine';
import { handleReport } from '../alpha-report-handler';
import { logger } from '../../../shared/utils/logger';

const SYMBOL = 'BTC/USD';
const TF = '1h';

function makeConfig(): ExperimentConfig {
  return {
    experimentId: 'test-rsi',
    hypothesis: 'test',
    symbol: SYMBOL,
    timeframe: TF,
    features: ['momentum'],
    regimes: ['TREND_UP'],
    tp: 0.015,
    sl: 0.008,
    maxHolding: 12,
    lookback: 20,
    split: { mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
    cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
    seed: 42,
    gitCommit: 'HEAD',
    createdAt: '2026-08-16T00:00:00Z',
  } as unknown as ExperimentConfig;
}

describe('handleReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigByName.mockReturnValue(makeConfig());
    mockRunExperiment.mockReturnValue({ config: makeConfig(), steps: [], metrics: { train: { numTrades: 5, winRate: 0.6, sharpeRatio: 1.2, profitFactor: 1.5, maxDrawdown: -0.05, totalPnl: 0.02, lossRate: 0.2, timeoutRate: 0.2, meanLabel: 0.4, regimesPresent: [] } }, totalBars: 400, numSteps: 1 });
  });

  it('loads config, runs experiment, evaluates, and prints report sections', async () => {
    await handleReport('test-rsi', {});
    expect(mockLoadConfigByName).toHaveBeenCalledWith('test-rsi');
    expect(mockRunExperiment).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
    // header
    expect((logger.info as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes('Report: test-rsi'))).toBe(true);
  });

  it('writes JSON output and returns early when json flag set', async () => {
    await handleReport('test-rsi', { json: true });
    expect(mockWriteOutput).toHaveBeenCalled();
    // should NOT have printed table sections
    expect((logger.info as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes('By Regime'))).toBe(false);
  });

  it('passes output file through to writeOutput', async () => {
    await handleReport('test-rsi', { output: '/tmp/report.json' });
    const [data, file] = (mockWriteOutput as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(file).toBe('/tmp/report.json');
    expect(data).toHaveProperty('experimentId', 'test-rsi');
    expect(data).toHaveProperty('overall');
    expect(data).toHaveProperty('byRegime');
  });

  it('exposes regime/month/volatility breakdowns in the JSON output', async () => {
    await handleReport('test-rsi', { json: true });
    const [data] = (mockWriteOutput as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Array.isArray(data.byRegime)).toBe(true);
    expect(Array.isArray(data.byMonth)).toBe(true);
    expect(Array.isArray(data.byVolatilityBucket)).toBe(true);
    expect(data).toHaveProperty('dataSource', 'mock');
    expect(data).toHaveProperty('overall');
  });
});
