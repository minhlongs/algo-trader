/**
 * Tests for alpha-ablation-handler.handleAblation.
 *
 * Mocks alpha-helpers and experiment-engine so the ablation loop, the
 * last-feature branch, the error branch, and json/table output paths
 * can all be driven deterministically.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger,
  mockLoadConfigByName,
  mockLoadCandles,
  mockWriteOutput,
  mockPrintTable,
  mockRunExperiment,
} = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockLoadConfigByName: vi.fn(),
  mockLoadCandles: vi.fn(),
  mockWriteOutput: vi.fn(),
  mockPrintTable: vi.fn(),
  mockRunExperiment: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../alpha-helpers', () => ({
  loadConfigByName: mockLoadConfigByName,
  loadCandlesForConfig: mockLoadCandles,
  writeOutput: mockWriteOutput,
  printTable: mockPrintTable,
}));
vi.mock('../../../alpha-lab/experiments/experiment-engine', () => ({ runExperiment: mockRunExperiment }));

import { handleAblation } from '../alpha-ablation-handler';

const BASE_CFG = {
  experimentId: 'exp-1',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  features: ['momentum', 'volume', 'rsi'],
  cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  seed: 42,
};

function metric(sharpe: number, pnl: number) {
  return { metrics: { test: { sharpeRatio: sharpe, winRate: 0.6, totalPnl: pnl } } };
}

describe('handleAblation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfigByName.mockReturnValue(BASE_CFG);
    mockLoadCandles.mockResolvedValue({ candles: [], source: 'mock', dataSources: [] });
    // Full model (3 features) scores best; removing a feature lowers SR and PnL proportionally.
    mockRunExperiment.mockImplementation(({ config }: { config: { features: string[] } }) =>
      metric(2 - config.features.length * 0.5, 10 - config.features.length * 2)
    );
  });

  it('runs the full model once and then one ablation per feature', async () => {
    await handleAblation('exp-1', {});

    // Full run first, then ablated for each of the 3 features.
    expect(mockRunExperiment).toHaveBeenCalledTimes(4);
    expect(mockRunExperiment).toHaveBeenNthCalledWith(1, expect.objectContaining({
      config: BASE_CFG,
    }));
    expect(mockRunExperiment).toHaveBeenNthCalledWith(2, expect.objectContaining({
      config: expect.objectContaining({ experimentId: 'exp-1-ablated-momentum', features: ['volume', 'rsi'] }),
    }));
  });

  it('classifies contribution as significant / marginal / negative', async () => {
    mockRunExperiment
      .mockReturnValueOnce(metric(2.0, 10))
      .mockReturnValueOnce(metric(1.5, 8)) // -0.5 significant
      .mockReturnValueOnce(metric(1.9, 9)) // -0.1 marginal
      .mockReturnValueOnce(metric(2.5, 11)); // +0.5 negative

    await handleAblation('exp-1', {});

    expect(mockPrintTable).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.arrayContaining(['momentum', '1.5000', '+0.5000', '8.0000', '+2.0000', 'significant']),
        expect.arrayContaining(['volume', '1.9000', '+0.1000', '9.0000', '+1.0000', 'significant']),
        expect.arrayContaining(['rsi', '2.5000', '-0.5000', '11.0000', '-1.0000', 'negative']),
      ],
    );
  });

  it('marks the last remaining feature as "last feature" and zeroes metrics', async () => {
    mockLoadConfigByName.mockReturnValue({ ...BASE_CFG, features: ['momentum'] });
    mockRunExperiment.mockReturnValueOnce(metric(2.0, 10));

    await handleAblation('exp-1', {});

    expect(mockPrintTable).toHaveBeenCalledWith(expect.anything(), [
      ['momentum', '0.0000', '+0.0000', '0.0000', '+0.0000', 'last feature'],
    ]);
  });

  it('records an error branch instead of letting it propagate', async () => {
    mockRunExperiment
      .mockReturnValueOnce(metric(2.0, 10))
      .mockRejectedValueOnce(new Error('ablation blew up'))
      .mockReturnValueOnce(metric(1.8, 9));

    await handleAblation('exp-1', {});

    expect(mockPrintTable).toHaveBeenCalledWith(expect.anything(), [
      expect.arrayContaining(['momentum', '0.0000', '+0.0000', '0.0000', '+0.0000', 'error']),
      expect.arrayContaining(['volume', '1.8000', '+0.2000', '9.0000', '+1.0000', 'significant']),
      expect.arrayContaining(['rsi', '1.0000', '+1.0000', '6.0000', '+4.0000', 'significant']),
    ]);
  });

  it('writes json output instead of a table when json flag is set', async () => {
    mockRunExperiment.mockReturnValueOnce(metric(2.0, 10));

    await handleAblation('exp-1', { json: true });

    expect(mockWriteOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: 'exp-1',
        features: ['momentum', 'volume', 'rsi'],
        fullTestSharpe: 2.0,
        fullTestPnl: 10,
        dataSource: 'mock',
      }),
      undefined,
      true,
    );
    expect(mockPrintTable).not.toHaveBeenCalled();
  });

  it('writes to the output path when provided', async () => {
    await handleAblation('exp-1', { output: 'out/ablation.json' });

    expect(mockWriteOutput).toHaveBeenCalledWith(expect.anything(), 'out/ablation.json', undefined);
    expect(mockPrintTable).not.toHaveBeenCalled();
  });
});
