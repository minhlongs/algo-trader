/**
 * Tests for performance-handler — handlePerformanceQuery.
 *
 * getAccuracyReport and BacktestRunner are mocked; logger is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockGetAccuracyReport, mockBacktestRunner } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockGetAccuracyReport: vi.fn(),
  mockBacktestRunner: { run: vi.fn() },
}));

vi.mock('../../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../intelligence/prediction-accuracy-tracker', () => ({
  getAccuracyReport: mockGetAccuracyReport,
}));
vi.mock('../../../../backtesting/backtest-runner', () => ({
  BacktestRunner: function BacktestRunner() { return mockBacktestRunner; },
}));

import { handlePerformanceQuery } from '../performance-handler';
import type { AccuracyReport } from '../../../intelligence/prediction-accuracy-tracker';

function makeReport(overrides: Partial<AccuracyReport> = {}): AccuracyReport {
  return {
    winRate: 0.6,
    correct: 60,
    resolved: 100,
    totalPredictions: 120,
    pending: 20,
    avgConfidenceWhenCorrect: 0.8,
    avgConfidenceWhenIncorrect: 0.5,
    byStrategy: {},
    byConfidenceBucket: {},
    ...overrides,
  };
}

describe('handlePerformanceQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccuracyReport.mockReturnValue(makeReport());
    mockBacktestRunner.run.mockRejectedValue(new Error('not implemented'));
  });

  it('returns a CopilotResponse with answer and actions', async () => {
    const res = await handlePerformanceQuery();
    expect(res.answer).toContain('**Strategy Performance**');
    expect(res.actions).toHaveLength(2);
    expect(res.sourceData).toEqual(
      expect.objectContaining({
        winRate: 0.6,
        totalPredictions: 120,
        resolvedCount: 100,
        topStrategies: [],
        avgConfidenceCorrect: 0.8,
        avgConfidenceIncorrect: 0.5,
      }),
    );
  });

  it('renders win rate and resolved counts in the answer', async () => {
    const res = await handlePerformanceQuery();
    expect(res.answer).toContain('Win rate: 60.0% (60/100 resolved)');
    expect(res.answer).toContain('Pending: 20 predictions');
    expect(res.answer).toContain('Avg confidence (correct): 80.0%');
    expect(res.answer).toContain('Avg confidence (incorrect): 50.0%');
  });

  it('lists top strategies by win rate when there are any', async () => {
    mockGetAccuracyReport.mockReturnValue(makeReport({
      byStrategy: {
        stratA: { winRate: 0.9, correct: 9, total: 10, confidenceBucket: 0.5 } as never,
        stratB: { winRate: 0.7, correct: 7, total: 10, confidenceBucket: 0.5 } as never,
      },
    }));
    const res = await handlePerformanceQuery();
    expect(res.answer).toContain('**Top Strategies by Win Rate:**');
    expect(res.answer).toContain('1. stratA: 90.0% (9/10)');
    expect(res.answer).toContain('2. stratB: 70.0% (7/10)');
    expect(res.sourceData.topStrategies).toEqual(['stratA', 'stratB']);
  });

  it('omits the top-strategies section when there are no strategies', async () => {
    const res = await handlePerformanceQuery();
    expect(res.answer).not.toContain('**Top Strategies by Win Rate:**');
  });

  it('runs a backtest for the given strategyId and appends a note', async () => {
    mockBacktestRunner.run.mockResolvedValue({ metrics: { totalPnl: 123.456, totalTrades: 7 } });
    const res = await handlePerformanceQuery({ strategyId: 'strat-1' });
    expect(mockBacktestRunner.run).toHaveBeenCalledWith({
      strategy: 'strat-1',
      paperTrading: true,
      capitalUsdc: 5000,
      days: 30,
    });
    expect(res.answer).toContain('Backtest (strat-1): $123.46 P&L, 7 trades');
  });

  it('uses N/A when the backtest result has no metrics', async () => {
    mockBacktestRunner.run.mockResolvedValue(null);
    const res = await handlePerformanceQuery({ strategyId: 'strat-x' });
    expect(res.answer).toContain('Backtest (strat-x): $N/A P&L, 0 trades');
  });

  it('silently swallows backtest errors', async () => {
    mockBacktestRunner.run.mockRejectedValue(new Error('boom'));
    const res = await handlePerformanceQuery({ strategyId: 'strat-err' });
    expect(res.answer).not.toContain('Backtest');
  });

  it('uses the injected backtestRunner when provided', async () => {
    const injected = { run: vi.fn().mockResolvedValue({ metrics: { totalPnl: 1, totalTrades: 2 } }) };
    await handlePerformanceQuery({ strategyId: 's' }, { backtestRunner: injected as never });
    expect(injected.run).toHaveBeenCalledWith({
      strategy: 's', paperTrading: true, capitalUsdc: 5000, days: 30,
    });
  });
});
