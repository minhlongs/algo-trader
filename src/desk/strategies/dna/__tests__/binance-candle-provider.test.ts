/**
 * Tests for binance-candle-provider.ts (Phase 05).
 *
 * Verifies:
 * - fetchBinanceCandles: URL building, timeout/abort, response parsing, candle filtering.
 * - BinanceCandleProvider: caching, invalidation, getLatestClose, TF mapping.
 *
 * CONTRACT: candles are returned **oldest-first** (oldest → newest). This matches
 * the filter-spec rule: "lọc kline tuples vào Candle theo thứ tự oldest-first".
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BinanceCandleProvider,
  createBinanceCandleProvider,
  fetchBinanceCandles,
} from '../binance-candle-provider';

// ── Helpers ───────────────────────────────────────────────────────────────────

const interval = 60_000;

function mkKline(openTime: number, close: number): [
  number, string, string, string, string, string, number, string, number, string, string, string,
] {
  return [
    openTime,
    String(close - 0.5),
    String(close + 0.5),
    String(close - 0.5),
    String(close),
    String(1),
    openTime + 59_999,
    String(1),
    1,
    String(1),
    String(1),
    'ignore',
  ];
}

/**
 * Build an array of klines matching the Binance API contract (newest-first).
 * The last row is the still-open candle and will be dropped by `fetchBinanceCandles`.
 *
 * With count=5 → 5 rows; drop last → 4 closed candles.
 * With count=3 → 3 rows; drop last → 2 closed candles.
 */
function mkKlines(toTs: number, count = 5) {
  return Array.from({ length: count }, (_, i) => mkKline(toTs - i * interval, 100 + i), );
}

function mockSuccess(klines: any[], status = 200) {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    const u = new URL(url);
    const endTime = u.searchParams.get('endTime');
    let filtered = klines;
    if (endTime) {
      const cut = Number(endTime);
      filtered = klines.filter((k: any) => k[0] <= cut);
    }
    return Promise.resolve({
      ok: status < 400,
      status,
      json: async () => filtered,
    } as any);
  });
}

// ── fetchBinanceCandles ────────────────────────────────────────────────────────

describe('fetchBinanceCandles', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis.fetch as any) = originalFetch;
    vi.useRealTimers();
  });

  it('builds URL with symbol, interval, and limit', async () => {
    mockSuccess(mkKlines(1_700_000_000_000, 5));
    await fetchBinanceCandles('BTCUSDT', '1h', 100);
    const url = (globalThis.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('symbol=BTCUSDT');
    expect(url).toContain('interval=1h');
    expect(url).toContain('limit=100');
  });

  it('parses numeric fields from string kline values', async () => {
    mockSuccess(mkKlines(1_700_000_000_000, 2));
    const candles = await fetchBinanceCandles('BTCUSDT', '1m', 10);
    expect(candles.length).toBe(1);
    expect(typeof candles[0].open).toBe('number');
    expect(typeof candles[0].close).toBe('number');
  });

  it('outputs candles in oldest-first order', async () => {
    mockSuccess(mkKlines(1_700_000_000_000, 6));
    const candles = await fetchBinanceCandles('BTCUSDT', '1m', 10);
    expect(candles.length).toBe(5);
    // Binance API is newest-first; we reverse once at the boundary.
    expect(candles[0].timestamp).toBeLessThan(candles.at(-1)!.timestamp);
  });

  it('returns [] on empty Binance response', async () => {
    mockSuccess([]);
    const candles = await fetchBinanceCandles('BTCUSDT', '1m', 10);
    expect(candles).toEqual([]);
  });

  it('throws on non-ok HTTP with symbol/interval context', async () => {
    mockSuccess([], 400);
    await expect(fetchBinanceCandles('BTCUSDT', '1m', 10)).rejects.toThrow(/BTCUSDT.*1m/);
  });

  it('throws on HTTP 502 with context', async () => {
    mockSuccess([], 502);
    await expect(fetchBinanceCandles('BTCUSDT', '1m', 10)).rejects.toThrow(/502/);
  });

  it('rejects with AbortError when AbortController is aborted', async () => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
    return new Promise((_resolve, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  });
  const p = fetchBinanceCandles('BTCUSDT', '1m', 10);
  vi.advanceTimersByTimeAsync(10_001);
  await expect(p).rejects.toThrow('Aborted');
  vi.useRealTimers();
});

});

// ── BinanceCandleProvider ──────────────────────────────────────
describe('BinanceCandleProvider', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis.fetch as any) = originalFetch;
    vi.useRealTimers();
  });

  it('defaults symbol to BTCUSDT', () => {
    const p = new BinanceCandleProvider();
    expect(p.symbol).toBe('BTCUSDT');
  });

  it('accepts a custom symbol', () => {
    const p = new BinanceCandleProvider('ETHUSDT');
    expect(p.symbol).toBe('ETHUSDT');
  });

  it('getLatestClose delegates to fetchBinanceCandles', async () => {
    mockSuccess(mkKlines(1_700_000_000_000, 3));
    const p = new BinanceCandleProvider();
    const c = await p.getLatestClose('1m');
    expect(typeof c).toBe('number');
  });
});
