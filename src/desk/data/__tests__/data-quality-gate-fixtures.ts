/**
 * Data Quality Gate Test Fixtures — Tranche 41
 * Shared constants, candle factories, and config builder for data-quality-gate suites.
 */
import { BacktestRunner, type BacktestRunnerOptions } from '../../backtesting/backtest-runner';
import { type OhlcvCandle } from '../ohlcv-store';

export const HOUR = 3_600_000;
export const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);

export type OhlcvBacktestConfig = BacktestRunnerOptions & {
  ohlcvMarket: string;
  ohlcvTimeframe: string;
};

export function makeOhlcvConfig(overrides: Partial<BacktestRunnerOptions> = {}): OhlcvBacktestConfig {
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

export function makeCleanCandles(count: number): OhlcvCandle[] {
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
