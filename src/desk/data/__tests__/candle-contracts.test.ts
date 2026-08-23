/**
 * Candle Contracts Tests
 *
 * Deterministic fixtures validating the Zod schemas in candle-contracts.ts.
 */
import { describe, it, expect } from 'vitest';
import type { OhlcvCandle } from '../ohlcv-store';
import {
  OhlcvBatchSchema,
  OhlcvCandleSchema,
  safeParseOhlcvBatch,
} from '../candle-contracts';

const HOUR = 3_600_000;
const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);

function makeCandle(overrides: Partial<OhlcvCandle> = {}): OhlcvCandle {
  return {
    market: 'BTC/USD',
    exchange: 'binance',
    timeframe: '1h',
    timestamp: new Date(BASE),
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: 1000,
    ...overrides,
  };
}

function makeBatch(count: number): OhlcvCandle[] {
  return Array.from({ length: count }, (_, i) =>
    makeCandle({ timestamp: new Date(BASE + i * HOUR) }));
}

describe('OhlcvCandleSchema', () => {
  it('accepts a valid candle', () => {
    expect(OhlcvCandleSchema.safeParse(makeCandle()).success).toBe(true);
  });

  it('rejects high below max(open, close)', () => {
    const bad = makeCandle({ open: 100, close: 105, high: 102, low: 99 });
    expect(OhlcvCandleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects low above min(open, close)', () => {
    const bad = makeCandle({ open: 100, close: 95, high: 101, low: 97 });
    expect(OhlcvCandleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative volume', () => {
    expect(OhlcvCandleSchema.safeParse(makeCandle({ volume: -5 })).success).toBe(false);
  });

  it('accepts zero volume', () => {
    expect(OhlcvCandleSchema.safeParse(makeCandle({ volume: 0 })).success).toBe(true);
  });

  it('rejects unknown timeframe', () => {
    const bad = makeCandle({ timeframe: '99x' });
    expect(OhlcvCandleSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-finite prices', () => {
    expect(OhlcvCandleSchema.safeParse(makeCandle({ close: Number.NaN })).success).toBe(false);
    expect(OhlcvCandleSchema.safeParse(makeCandle({ high: Infinity })).success).toBe(false);
  });

  it('rejects empty market', () => {
    expect(OhlcvCandleSchema.safeParse(makeCandle({ market: '' })).success).toBe(false);
  });
});

describe('OhlcvBatchSchema', () => {
  it('accepts a clean monotonic batch', () => {
    expect(OhlcvBatchSchema.safeParse(makeBatch(5)).success).toBe(true);
  });

  it('accepts an empty batch', () => {
    expect(OhlcvBatchSchema.safeParse([]).success).toBe(true);
  });

  it('rejects duplicate timestamps', () => {
    const batch = makeBatch(3);
    batch[2] = { ...batch[2], timestamp: batch[1].timestamp };
    expect(safeParseOhlcvBatch(batch).success).toBe(false);
  });

  it('rejects out-of-order timestamps', () => {
    const batch = makeBatch(3);
    const tmp = batch[1];
    batch[1] = batch[2];
    batch[2] = tmp;
    expect(safeParseOhlcvBatch(batch).success).toBe(false);
  });

  it('rejects a batch containing one corrupt candle', () => {
    const batch = makeBatch(3);
    batch[1] = { ...batch[1], high: 50, low: 40 }; // high < open/close
    expect(safeParseOhlcvBatch(batch).success).toBe(false);
  });
});
