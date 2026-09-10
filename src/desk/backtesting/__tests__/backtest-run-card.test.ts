/**
 * Tests for backtest-run-card — writeBacktestRunCard.
 *
 * Covers: early return when no runCardDir, OHLCV path, gamma path,
 * resultClass fallback, data source shape, metrics passthrough.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockWriteRunCard } = vi.hoisted(() => ({
  mockWriteRunCard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../alpha-lab/provenance/run-card', () => ({
  writeRunCard: mockWriteRunCard,
}));

import { writeBacktestRunCard } from '../backtest-run-card';
import type { BacktestResult, BacktestRunnerOptions } from '../types';
import type { OhlcvCandle } from '../../data/ohlcv-store';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOptions(overrides: Partial<BacktestRunnerOptions> = {}): BacktestRunnerOptions {
  return {
    strategy: 'strat-A',
    runCardDir: '/tmp/run-cards',
    tickIntervalMs: 3_600_000,
    ...overrides,
  } as BacktestRunnerOptions;
}

function makeResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    startedAt: 1_700_000_000_000,
    completedAt: 1_700_000_001_000,
    durationMs: 1000,
    warnings: [],
    metrics: {
      totalPnl: 150,
      sharpeRatio: 1.2,
      maxDrawdown: 0.05,
      winRate: 0.6,
      totalTrades: 10,
    },
    equityCurve: [100, 101, 102, 103],
    ...overrides,
  } as BacktestResult;
}

function makeCandle(overrides: Partial<OhlcvCandle> = {}): OhlcvCandle {
  return {
    market: 'BTC-USD',
    timeframe: '1h',
    timestamp: '2026-01-01T00:00:00Z',
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
    ...overrides,
  } as OhlcvCandle;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('writeBacktestRunCard', () => {
  beforeEach(() => {
    mockWriteRunCard.mockClear();
  });

  it('does nothing when runCardDir is unset', () => {
    const result = makeResult();
    const config = makeOptions({ runCardDir: undefined });
    writeBacktestRunCard(config, result, []);
    expect(mockWriteRunCard).not.toHaveBeenCalled();
  });

  it('does nothing when runCardDir is empty string', () => {
    const result = makeResult();
    const config = makeOptions({ runCardDir: '' });
    writeBacktestRunCard(config, result, []);
    expect(mockWriteRunCard).not.toHaveBeenCalled();
  });

  it('cites ohlcv-store as data source when candles are present', () => {
    const result = makeResult();
    const config = makeOptions();
    const candles = [makeCandle({ market: 'ETH-USD', timeframe: '4h' }), makeCandle()];
    writeBacktestRunCard(config, result, candles);

    expect(mockWriteRunCard).toHaveBeenCalledTimes(1);
    const [dir, card] = mockWriteRunCard.mock.calls[0];
    expect(dir).toBe('/tmp/run-cards');
    expect(card.dataSources).toEqual([
      {
        provider: 'ohlcv-store',
        symbol: 'ETH-USD',
        timeframe: '4h',
        start: new Date(result.startedAt).toISOString(),
        end: new Date(result.completedAt).toISOString(),
        retrievedAt: result.completedAt,
        candleCount: 2,
      },
    ]);
  });

  it('cites gamma as data source when no candles are present', () => {
    const result = makeResult();
    const config = makeOptions();
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.dataSources).toEqual([
      {
        provider: 'gamma',
        symbol: 'strat-A',
        timeframe: '3600000',
        start: new Date(result.startedAt).toISOString(),
        end: new Date(result.completedAt).toISOString(),
        retrievedAt: result.completedAt,
        candleCount: result.equityCurve.length,
      },
    ]);
  });

  it('defaults tickIntervalMs to 3600000 when unset', () => {
    const result = makeResult();
    const config = makeOptions({ tickIntervalMs: undefined });
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.dataSources[0].timeframe).toBe('3600000');
  });

  it('uses provided tickIntervalMs when set', () => {
    const result = makeResult();
    const config = makeOptions({ tickIntervalMs: 60_000 });
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.dataSources[0].timeframe).toBe('60000');
  });

  it('defaults resultClass to PAPER when unset', () => {
    const result = makeResult();
    const config = makeOptions({ resultClass: undefined });
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.resultClass).toBe('PAPER');
  });

  it('uses provided resultClass when set', () => {
    const result = makeResult();
    const config = makeOptions({ resultClass: 'LIVE' as any });
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.resultClass).toBe('LIVE');
  });

  it('passes through runId, strategyRef, metrics and warnings', () => {
    const result = makeResult({ warnings: ['low data'] });
    const config = makeOptions();
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.runId).toBe('strat-A-1700000000000');
    expect(card.strategyRef).toBe('strat-A');
    expect(card.metrics).toEqual({
      totalPnl: 150,
      sharpeRatio: 1.2,
      maxDrawdown: 0.05,
      winRate: 0.6,
      tradeCount: 10,
      durationMs: 1000,
    });
    expect(card.warnings).toEqual(['low data']);
  });

  it('passes config as a record to writeRunCard', () => {
    const result = makeResult();
    const config = makeOptions();
    writeBacktestRunCard(config, result, []);

    const [, card] = mockWriteRunCard.mock.calls[0];
    expect(card.config).toBe(config);
    expect(card.config.strategy).toBe('strat-A');
  });
});