/**
 * Tests for alpha-discover-handler.handleDiscover.
 *
 * Mocks alpha-helpers, experiment-engine and baseline-runner so
 * handleDiscover can be driven through config filtering, the survival
 * gate, error skipping, and json/table output branches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger,
  mockLoadAllConfigs,
  mockLoadCandles,
  mockWriteOutput,
  mockPrintTable,
  mockRunExperiment,
  mockRunAllBaselines,
} = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockLoadAllConfigs: vi.fn(),
  mockLoadCandles: vi.fn(),
  mockWriteOutput: vi.fn(),
  mockPrintTable: vi.fn(),
  mockRunExperiment: vi.fn(),
  mockRunAllBaselines: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../alpha-helpers', () => ({
  loadAllConfigs: mockLoadAllConfigs,
  loadCandlesForConfig: mockLoadCandles,
  writeOutput: mockWriteOutput,
  printTable: mockPrintTable,
}));
vi.mock('../../../alpha-lab/experiments/experiment-engine', () => ({ runExperiment: mockRunExperiment }));
vi.mock('../../../alpha-lab/baselines/baseline-runner', () => ({ runAllBaselines: mockRunAllBaselines }));

import { handleDiscover } from '../alpha-discover-handler';

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    experimentId: 'exp-1',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    cost: { feeBps: 5, slippageBps: 2 },
    seed: 42,
    ...overrides,
  };
}

function stubRun(sharpe = 1.5, winRate = 0.6, totalPnl = 12.5) {
  mockRunExperiment.mockReturnValue({
    metrics: { test: { sharpeRatio: sharpe, winRate, totalPnl } },
  });
  mockRunAllBaselines.mockReturnValue([
    { name: 'buy-hold', report: { sharpeRatio: 0.5 } },
    { name: 'random', report: { sharpeRatio: 0.2 } },
  ]);
}

describe('handleDiscover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadCandles.mockResolvedValue({
      candles: [{ timestamp: '2026-01-01', close: 1 }],
      source: 'mock',
      dataSources: [],
    });
    stubRun();
  });

  it('returns early when no configs exist', async () => {
    mockLoadAllConfigs.mockReturnValue([]);
    await handleDiscover('BTC/USDT', { tf: '1h' });
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('No experiment configs found'));
    expect(mockLoadCandles).not.toHaveBeenCalled();
    expect(mockPrintTable).not.toHaveBeenCalled();
  });

  it('skips configs with a different symbol or timeframe', async () => {
    mockLoadAllConfigs.mockReturnValue([
      makeConfig({ experimentId: 'wrong-sym', symbol: 'ETH/USDT' }),
      makeConfig({ experimentId: 'wrong-tf', timeframe: '4h' }),
    ]);
    await handleDiscover('BTC/USDT', { tf: '1h' });
    expect(mockLoadCandles).not.toHaveBeenCalled();
  });

  it('evaluates matching configs and prints a table sorted by sharpe', async () => {
    mockLoadAllConfigs.mockReturnValue([
      makeConfig({ experimentId: 'weak', symbol: 'BTC/USDT' }),
      makeConfig({ experimentId: 'strong', symbol: 'BTC/USDT' }),
    ]);
    mockRunExperiment
      .mockReturnValueOnce({ metrics: { test: { sharpeRatio: 0.8, winRate: 0.6, totalPnl: 2 } } })
      .mockReturnValueOnce({ metrics: { test: { sharpeRatio: 2.1, winRate: 0.7, totalPnl: 9 } } });
    mockLoadCandles
      .mockResolvedValueOnce({ candles: [], source: 'real', dataSources: [] })
      .mockResolvedValueOnce({ candles: [], source: 'mock', dataSources: [] });

    await handleDiscover('BTC/USDT', { tf: '1h' });

    expect(mockRunExperiment).toHaveBeenCalledTimes(2);
    expect(mockPrintTable).toHaveBeenCalledWith(
      ['Experiment', 'Sharpe', 'Win%', 'PnL', 'Survival'],
      [
        ['strong', '2.10', '70.0%', '9.0000', 'PASS'],
        ['weak', '0.80', '60.0%', '2.0000', 'PASS'],
      ],
    );
    // Sorted desc → first result's data source is reported.
    expect(mockLogger.info).toHaveBeenCalledWith('Data source: mock');
  });

  it('marks survival as empty when the sharpe does not beat the baselines', async () => {
    mockLoadAllConfigs.mockReturnValue([makeConfig()]);
    stubRun(0.3, 0.55, 1);

    await handleDiscover('BTC/USDT', { tf: '1h' });

    expect(mockPrintTable).toHaveBeenCalledWith(
      expect.anything(),
      [[expect.anything(), '0.30', '55.0%', '1.0000', '']],
    );
  });

  it('marks survival as empty when win rate is at or below 0.5', async () => {
    mockLoadAllConfigs.mockReturnValue([makeConfig()]);
    stubRun(1.5, 0.5, 5);

    await handleDiscover('BTC/USDT', { tf: '1h' });

    expect(mockPrintTable).toHaveBeenCalledWith(
      expect.anything(),
      [[expect.anything(), '1.50', '50.0%', '5.0000', '']],
    );
  });

  it('skips a config whose candle load fails and warns', async () => {
    mockLoadAllConfigs.mockReturnValue([makeConfig()]);
    mockLoadCandles.mockRejectedValue(new Error('no data'));

    await handleDiscover('BTC/USDT', { tf: '1h' });

    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Skipping exp-1: no data'));
    expect(mockRunExperiment).not.toHaveBeenCalled();
    // Table still prints for the (empty) result set.
    expect(mockPrintTable).toHaveBeenCalledWith(expect.anything(), []);
    expect(mockLogger.info).toHaveBeenCalledWith('Data source: N/A');
  });

  it('writes json output instead of a table when json flag is set', async () => {
    mockLoadAllConfigs.mockReturnValue([makeConfig()]);
    await handleDiscover('BTC/USDT', { tf: '1h', json: true });

    expect(mockWriteOutput).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          experimentId: 'exp-1',
          symbol: 'BTC/USDT',
          sharpe: 1.5,
          winRate: 0.6,
          totalPnl: 12.5,
          survivalGate: true,
          dataSource: 'mock',
        }),
      ],
      undefined,
      true,
    );
    expect(mockPrintTable).not.toHaveBeenCalled();
  });

  it('writes to the output path when provided', async () => {
    mockLoadAllConfigs.mockReturnValue([makeConfig()]);
    await handleDiscover('BTC/USDT', { tf: '1h', output: 'out/results.json' });

    expect(mockWriteOutput).toHaveBeenCalledWith(
      expect.anything(),
      'out/results.json',
      undefined,
    );
    expect(mockPrintTable).not.toHaveBeenCalled();
  });
});
