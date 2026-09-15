/**
 * Data Quality Gate Tests — BacktestRunner Integration
 * Validates strict/non-strict data quality enforcement in BacktestRunner.
 */
import { describe, it, expect, vi } from 'vitest';
import { getHistoricalData } from '../ohlcv-store';
import { BacktestRunner } from '../../backtesting/backtest-runner';
import { makeCleanCandles, makeOhlcvConfig } from './data-quality-gate-fixtures';

vi.mock('../ohlcv-store', () => ({
  getHistoricalData: vi.fn(),
}));

describe('BacktestRunner data quality integration', () => {
  it('rejects a gapped dataset in strict mode (default) before replay', async () => {
    const gapped = makeCleanCandles(20);
    gapped.splice(8, 5);
    vi.mocked(getHistoricalData).mockResolvedValue(gapped);

    const runner = new BacktestRunner();
    await expect(runner.run(makeOhlcvConfig())).rejects.toThrow(/Data quality gate failed/);
  });

  it('rejects a gapped dataset when strict is explicitly true', async () => {
    const gapped = makeCleanCandles(20);
    gapped.splice(8, 5);
    vi.mocked(getHistoricalData).mockResolvedValue(gapped);

    const runner = new BacktestRunner();
    await expect(
      runner.run(makeOhlcvConfig({ dataQuality: { strict: true } })),
    ).rejects.toThrow(/Data quality gate failed/);
  });

  it('continues with warnings when strict is false', async () => {
    const gapped = makeCleanCandles(20);
    gapped.splice(8, 5);
    vi.mocked(getHistoricalData).mockResolvedValue(gapped);

    const runner = new BacktestRunner();
    const result = await runner.run(makeOhlcvConfig({ dataQuality: { strict: false } }));
    expect(result.warnings.some((w) => w.includes('[data-quality]'))).toBe(true);
  });

  it('runs a clean dataset through strict mode without error', async () => {
    vi.mocked(getHistoricalData).mockResolvedValue(makeCleanCandles(30));

    const runner = new BacktestRunner();
    const result = await runner.run(makeOhlcvConfig());
    expect(result.metrics).toBeDefined();
    expect(result.equityCurve.length).toBe(30);
  });
});
