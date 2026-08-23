/**
 * Data Quality Gate Tests
 *
 * Deterministic fixtures — no mocks, no fake data. Each test builds a real
 * OhlcvCandle[] series and asserts the gate's verdict.
 */
import { describe, it, expect, vi } from 'vitest';
import { getHistoricalData, type OhlcvCandle } from '../ohlcv-store';
import { runDataQualityGate, timeframeToMs } from '../data-quality-gate';
import { BacktestRunner, type BacktestRunnerOptions } from '../../backtesting/backtest-runner';

// Stub only the DB boundary — the gate and runner logic under test are real.
vi.mock('../ohlcv-store', () => ({
  getHistoricalData: vi.fn(),
}));

type OhlcvBacktestConfig = BacktestRunnerOptions & {
  ohlcvMarket: string;
  ohlcvTimeframe: string;
};

function makeOhlcvConfig(overrides: Partial<BacktestRunnerOptions> = {}): OhlcvBacktestConfig {
  return {
    strategy: 'spread-mean-reversion',
    paperTrading: true,
    capitalUsdc: 1000,
    days: 7,
    ohlcvMarket: 'BTC/USD',
    ohlcvTimeframe: '1h',
    ...overrides,
  };
}

const HOUR = 3_600_000;
const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);

/** Build a clean, strictly-monotonic 1h candle series. */
function makeCleanCandles(count: number): OhlcvCandle[] {
  const candles: OhlcvCandle[] = [];
  for (let i = 0; i < count; i++) {
    const open = 100 + Math.sin(i) * 2;
    const close = 100 + Math.sin(i + 1) * 2;
    candles.push({
      market: 'BTC/USD',
      exchange: 'binance',
      timeframe: '1h',
      timestamp: new Date(BASE + i * HOUR),
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1000 + i,
    });
  }
  return candles;
}

describe('timeframeToMs', () => {
  it('maps known timeframes and returns undefined for unknown', () => {
    expect(timeframeToMs('1h')).toBe(HOUR);
    expect(timeframeToMs('1m')).toBe(60_000);
    expect(timeframeToMs('1d')).toBe(86_400_000);
    expect(timeframeToMs('99x')).toBeUndefined();
  });
});

describe('runDataQualityGate', () => {
  it('passes a clean dataset', () => {
    const report = runDataQualityGate(makeCleanCandles(50));
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.candleCount).toBe(50);
    expect(report.coveragePct).toBeCloseTo(1, 5);
  });

  it('fails on empty dataset', () => {
    const report = runDataQualityGate([]);
    expect(report.passed).toBe(false);
    expect(report.candleCount).toBe(0);
  });

  it('detects a gap (> 1 timeframe interval)', () => {
    const candles = makeCleanCandles(10);
    candles.splice(4, 3); // 4-interval gap
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'gap')).toBe(true);
    expect(report.coveragePct).toBeLessThan(1);
  });

  it('detects duplicate timestamps', () => {
    const candles = makeCleanCandles(10);
    candles[5] = { ...candles[5], timestamp: candles[4].timestamp };
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'duplicate-timestamp')).toBe(true);
  });

  it('detects OHLC invariant corruption', () => {
    const candles = makeCleanCandles(10);
    candles[5] = { ...candles[5], open: 100, close: 110, high: 105, low: 99 };
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'ohlc-invariant')).toBe(true);
  });

  it('detects negative volume', () => {
    const candles = makeCleanCandles(10);
    candles[3] = { ...candles[3], volume: -1 };
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'negative-volume')).toBe(true);
  });

  it('detects out-of-order timestamps as a gap violation', () => {
    const candles = makeCleanCandles(10);
    const tmp = candles[4];
    candles[4] = candles[5];
    candles[5] = tmp;
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'gap')).toBe(true);
  });

  it('detects a price jump exceeding N x ATR', () => {
    // Flat series so ATR is tiny, then a huge jump.
    const candles: OhlcvCandle[] = [];
    for (let i = 0; i < 30; i++) {
      candles.push({
        market: 'BTC/USD',
        exchange: 'binance',
        timeframe: '1h',
        timestamp: new Date(BASE + i * HOUR),
        open: 100,
        high: 100.1,
        low: 99.9,
        close: 100,
        volume: 1000,
      });
    }
    const last = candles[candles.length - 1];
    candles.push({
      ...last,
      timestamp: new Date(last.timestamp.getTime() + HOUR),
      open: 100,
      high: 150,
      low: 100,
      close: 150, // 50-point jump vs ATR ~0.2
    });
    const report = runDataQualityGate(candles, { priceJumpAtrMultiple: 10 });
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'price-jump')).toBe(true);
  });

  it('does not flag a normal price move as a jump', () => {
    const report = runDataQualityGate(makeCleanCandles(50), { priceJumpAtrMultiple: 10 });
    expect(report.violations.some((v) => v.code === 'price-jump')).toBe(false);
  });

  it('warns on a long zero-volume streak but still passes', () => {
    const candles = makeCleanCandles(40);
    for (let i = 10; i < 35; i++) candles[i] = { ...candles[i], volume: 0 };
    const report = runDataQualityGate(candles, { zeroVolumeStreakThreshold: 20 });
    expect(report.passed).toBe(true);
    expect(report.warnings.some((w) => w.code === 'zero-volume-streak')).toBe(true);
  });

  it('warns on low coverage from a gap', () => {
    const candles = makeCleanCandles(10);
    candles.splice(4, 3);
    const report = runDataQualityGate(candles, { minCoverage: 0.9 });
    expect(report.warnings.some((w) => w.code === 'low-coverage')).toBe(true);
  });

  it('skips gap detection and warns on unknown timeframe', () => {
    const candles = makeCleanCandles(10).map((c) => ({ ...c, timeframe: '99x' }));
    const report = runDataQualityGate(candles);
    expect(report.warnings.some((w) => w.code === 'unknown-timeframe')).toBe(true);
    expect(report.violations.filter((v) => v.code === 'gap')).toHaveLength(0);
  });

  it('respects an explicit timeframeMs override', () => {
    const candles = makeCleanCandles(10).map((c) => ({ ...c, timeframe: '99x' }));
    candles.splice(4, 3);
    const report = runDataQualityGate(candles, { timeframeMs: HOUR });
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'gap')).toBe(true);
  });

  it('is deterministic for identical input', () => {
    const candles = makeCleanCandles(30);
    expect(runDataQualityGate(candles)).toEqual(runDataQualityGate(candles));
  });
});

describe('BacktestRunner data quality integration', () => {
  // Only the DB fetch boundary is stubbed; the gate + runner logic are real.
  // Candle fixtures are deterministic real data, not mocked values.

  it('rejects a gapped dataset in strict mode (default) before replay', async () => {
    const gapped = makeCleanCandles(20);
    gapped.splice(8, 5); // inject a 6-interval gap
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
