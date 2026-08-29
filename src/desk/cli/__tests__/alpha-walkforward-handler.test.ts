/**
 * Tests for alpha-walkforward-handler.handleWalkforward.
 *
 * alpha-helpers and evaluateWalkForward are mocked; covers json/output
 * write path and the table+summary print path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger,
  mockLoadConfigByName,
  mockLoadCandles,
  mockWriteOutput,
  mockPrintTable,
  mockEvaluate,
} = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockLoadConfigByName: vi.fn(),
  mockLoadCandles: vi.fn(),
  mockWriteOutput: vi.fn(),
  mockPrintTable: vi.fn(),
  mockEvaluate: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../alpha-helpers', () => ({
  loadConfigByName: mockLoadConfigByName,
  loadCandlesForConfig: mockLoadCandles,
  writeOutput: mockWriteOutput,
  printTable: mockPrintTable,
}));
vi.mock('../../../alpha-lab/walkforward/walkforward-evaluator', () => ({ evaluateWalkForward: mockEvaluate }));

import { handleWalkforward } from '../alpha-walkforward-handler';

const BASE_CFG = { experimentId: 'exp-1', symbol: 'BTC/USDT', timeframe: '1h' };

function step(n: number, t: number, v: number, te: number, wr: number, trades: number) {
  return {
    step: n,
    trainMetrics: { sharpeRatio: t, winRate: wr },
    valMetrics: { sharpeRatio: v, winRate: wr },
    testMetrics: { sharpeRatio: te, winRate: wr, numTrades: trades },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfigByName.mockReturnValue(BASE_CFG);
  mockLoadCandles.mockResolvedValue({ candles: [], source: 'mock', dataSources: [] });
  mockEvaluate.mockReturnValue({
    summary: { totalSteps: 2, overfitGap: 0.05, consistencyScore: 0.8 },
    steps: [step(1, 1.5, 1.4, 1.2, 0.6, 10), step(2, 1.0, 0.9, 0.7, 0.5, 8)],
  });
});

describe('handleWalkforward', () => {
  it('writes json output when json flag is set', async () => {
    await handleWalkforward('exp-1', { json: true });
    expect(mockWriteOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: 'exp-1',
        symbol: 'BTC/USDT',
        timeframe: '1h',
        dataSource: 'mock',
        summary: { totalSteps: 2, overfitGap: 0.05, consistencyScore: 0.8 },
      }),
      undefined,
      true,
    );
    expect(mockPrintTable).not.toHaveBeenCalled();
  });

  it('writes to the output path when provided', async () => {
    await handleWalkforward('exp-1', { output: 'out/wf.json' });
    expect(mockWriteOutput).toHaveBeenCalledWith(expect.anything(), 'out/wf.json', undefined);
    expect(mockPrintTable).not.toHaveBeenCalled();
  });

  it('prints a step table and summary in the default path', async () => {
    await handleWalkforward('exp-1', {});
    expect(mockPrintTable).toHaveBeenCalledWith(
      ['Step', 'Train SR', 'Val SR', 'Test SR', 'Test WR', 'Trades'],
      [
        ['1', '1.50', '1.40', '1.20', '60.0%', '10'],
        ['2', '1.00', '0.90', '0.70', '50.0%', '8'],
      ],
    );
    expect(mockLogger.info).toHaveBeenCalledWith('Walk-Forward: exp-1');
    expect(mockLogger.info).toHaveBeenCalledWith('Symbol: BTC/USDT | TF: 1h | Source: mock');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Summary: 2 steps | Overfit gap: 5.0% | Consistency: 80%',
    );
  });

  it('maps each step with train/val/test metrics into json output', async () => {
    await handleWalkforward('exp-1', { json: true });
    const out = mockWriteOutput.mock.calls[0][0] as { steps: Array<Record<string, number>> };
    expect(out.steps).toHaveLength(2);
    expect(out.steps[0]).toEqual({
      step: 1,
      trainSharpe: 1.5,
      trainWinRate: 0.6,
      valSharpe: 1.4,
      valWinRate: 0.6,
      testSharpe: 1.2,
      testWinRate: 0.6,
      testTrades: 10,
    });
  });
});
