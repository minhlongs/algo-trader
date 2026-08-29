/**
 * Tests for alpha-robustness-handler.handleRobustness.
 *
 * Mocks alpha-helpers, experiment-engine and the lazily-imported
 * cost-stress module. The import-failure branch is driven by flipping a
 * hoisted flag inside the cost-stress mock factory after a
 * vi.resetModules() so the lazy dynamic import re-resolves and rejects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger,
  mockLoadConfigByName,
  mockLoadCandles,
  mockWriteOutput,
  mockPrintTable,
  mockRunExperiment,
  mockListStressModes,
  mockResolveCostConfig,
  mockApplyStress,
  mockTotalRoundTrip,
  mockCostImportFails,
} = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockLoadConfigByName: vi.fn(),
  mockLoadCandles: vi.fn(),
  mockWriteOutput: vi.fn(),
  mockPrintTable: vi.fn(),
  mockRunExperiment: vi.fn(),
  mockListStressModes: vi.fn(),
  mockResolveCostConfig: vi.fn(),
  mockApplyStress: vi.fn(),
  mockTotalRoundTrip: vi.fn(),
  mockCostImportFails: { value: false },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../alpha-helpers', () => ({
  loadConfigByName: mockLoadConfigByName,
  loadCandlesForConfig: mockLoadCandles,
  writeOutput: mockWriteOutput,
  printTable: mockPrintTable,
}));
vi.mock('../../../alpha-lab/experiments/experiment-engine', () => ({ runExperiment: mockRunExperiment }));
vi.mock('../../../alpha-lab/cost-model/cost-stress', () => {
  if (mockCostImportFails.value) throw new Error('module unavailable');
  return {
    listStressModes: mockListStressModes,
    resolveCostConfig: mockResolveCostConfig,
    applyStressToBaselineConfig: mockApplyStress,
    totalRoundTripCostBps: mockTotalRoundTrip,
  };
});

import { handleRobustness } from '../alpha-robustness-handler';

const BASE_CFG = { experimentId: 'exp-1', symbol: 'BTC/USDT', timeframe: '1h', cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' }, seed: 42 };

const STRESS_PRESETS = {
  NORMAL: { mode: 'NORMAL', feeBps: 5, spreadBps: 2, slippageBps: 3, label: 'Normal market conditions' },
  ADVERSE: { mode: 'ADVERSE', feeBps: 25, spreadBps: 10, slippageBps: 20, label: 'Adverse liquidity' },
};

function wireHappyPath() {
  mockListStressModes.mockReturnValue(['NORMAL', 'ADVERSE']);
  mockResolveCostConfig.mockImplementation((mode: keyof typeof STRESS_PRESETS) => STRESS_PRESETS[mode]);
  mockApplyStress.mockImplementation((_b: unknown, mode: string) =>
    mode === 'NORMAL' ? { feeBps: 7, slippageBps: 3 } : { feeBps: 35, slippageBps: 20 });
  mockTotalRoundTrip.mockImplementation((c: { feeBps: number; spreadBps: number }) => c.feeBps + c.spreadBps);
  mockRunExperiment.mockReturnValue({ metrics: { test: { sharpeRatio: 1.2, winRate: 0.6, totalPnl: 4 } } });
}

describe('handleRobustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCostImportFails.value = false;
    mockLoadConfigByName.mockReturnValue(BASE_CFG);
    mockLoadCandles.mockResolvedValue({ candles: [], source: 'mock', dataSources: [] });
    wireHappyPath();
  });

  it('evaluates every stress mode with folded fees and scenario lowercased', async () => {
    await handleRobustness('exp-1', {});

    expect(mockRunExperiment).toHaveBeenCalledTimes(2);
    expect(mockRunExperiment).toHaveBeenNthCalledWith(1, expect.objectContaining({
      config: expect.objectContaining({
        experimentId: 'exp-1-stress-NORMAL',
        cost: { feeBps: 7, slippageBps: 3, scenario: 'normal' },
      }),
    }));
    expect(mockRunExperiment).toHaveBeenNthCalledWith(2, expect.objectContaining({
      config: expect.objectContaining({
        experimentId: 'exp-1-stress-ADVERSE',
        cost: { feeBps: 35, slippageBps: 20, scenario: 'adverse' },
      }),
    }));
  });

  it('prints a table and the survival summary', async () => {
    await handleRobustness('exp-1', {});

    expect(mockPrintTable).toHaveBeenCalledWith(
      ['Mode', 'Fee(bps)', 'Slip(bps)', 'EffectiveRT(bps)', 'Test SR', 'Test WR', 'PnL', 'Edge?'],
      [
        ['NORMAL', '5', '3', '7', '1.20', '60.0%', '4.0000', 'YES'],
        ['ADVERSE', '25', '20', '35', '1.20', '60.0%', '4.0000', 'YES'],
      ],
    );
    expect(mockLogger.info).toHaveBeenCalledWith('Robustness: exp-1');
    expect(mockLogger.info).toHaveBeenCalledWith('Symbol: BTC/USDT | Source: mock');
    expect(mockLogger.info).toHaveBeenCalledWith('Edge survives in 2/2 cost modes.');
  });

  it('records a failed mode as zero metrics with edge not surviving', async () => {
    mockRunExperiment
      .mockReturnValueOnce({ metrics: { test: { sharpeRatio: 0.9, winRate: 0.55, totalPnl: 1 } } })
      .mockRejectedValueOnce(new Error('experiment blew up'));

    await handleRobustness('exp-1', {});

    expect(mockPrintTable).toHaveBeenCalledWith(expect.anything(), [
      ['NORMAL', '5', '3', '7', '0.90', '55.0%', '1.0000', 'YES'],
      ['ADVERSE', '25', '20', '35', '0.00', '0.0%', '0.0000', 'NO'],
    ]);
    expect(mockLogger.info).toHaveBeenCalledWith('Edge survives in 1/2 cost modes.');
  });

  it('writes json output instead of a table when json flag is set', async () => {
    await handleRobustness('exp-1', { json: true });

    expect(mockWriteOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: 'exp-1',
        symbol: 'BTC/USDT',
        dataSource: 'mock',
        stressResults: [
          expect.objectContaining({ mode: 'NORMAL', edgeSurvives: true, effectiveRoundTripBps: 7 }),
          expect.objectContaining({ mode: 'ADVERSE', edgeSurvives: true, effectiveRoundTripBps: 35 }),
        ],
      }),
      undefined,
      true,
    );
    expect(mockPrintTable).not.toHaveBeenCalled();
  });

  it('writes to the output path when provided', async () => {
    await handleRobustness('exp-1', { output: 'out/rob.json' });

    expect(mockWriteOutput).toHaveBeenCalledWith(expect.anything(), 'out/rob.json', undefined);
    expect(mockPrintTable).not.toHaveBeenCalled();
  });


});
