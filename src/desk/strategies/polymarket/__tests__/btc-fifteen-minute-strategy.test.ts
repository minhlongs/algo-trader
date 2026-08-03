import { describe, it, expect, vi } from 'vitest';
import { analyzeBtcFifteenMinute } from '../btc-fifteen-minute-strategy';

describe('btc-fifteen-minute-strategy::analyzeBtcFifteenMinute', () => {
  it('is an async function', () => {
    expect(typeof analyzeBtcFifteenMinute).toBe('function');
  });

  it('returns BtcSignal on mocked Binance data', async () => {
    const mockKlines = [];
    const basePrice = 100000;
    for (let i = 0; i < 16; i++) {
      mockKlines.push([
        Date.now() - (16 - i) * 60000,
        String(basePrice + i * 10),
        String(basePrice + i * 10 + 5),
        String(basePrice + i * 10 - 5),
        String(basePrice + i * 10),
        String(100 + i),
      ]);
    }

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => mockKlines,
    })));

    const result = await analyzeBtcFifteenMinute();
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('timestamp');
    expect(['UP', 'DOWN', 'NEUTRAL']).toContain(result.direction);
    expect(typeof result.confidence).toBe('number');
  }, 15000);

  it('throws on Binance HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 } as any)));
    await expect(analyzeBtcFifteenMinute()).rejects.toThrow();
  }, 10000);
});