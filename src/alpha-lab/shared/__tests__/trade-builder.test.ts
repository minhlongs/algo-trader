/**
 * Shared Trade Builder Tests
 *
 * Covers: Take-profit (label 1), stop-loss (label -1), timeout (label 0),
 * fee and slippage round-trip calculations, and exit price formulas.
 */

import { describe, it, expect } from 'vitest';
import { buildTrades } from '../trade-builder';
import type { CandleLike } from '../../regimes/regime-types';

describe('buildTrades', () => {
  const candles: CandleLike[] = [
    {
      timestamp: '2025-01-01T00:00:00Z',
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: 1000,
    },
    {
      timestamp: '2025-01-01T01:00:00Z',
      open: 200,
      high: 210,
      low: 190,
      close: 200,
      volume: 1500,
    },
    {
      timestamp: '2025-01-01T02:00:00Z',
      open: 300,
      high: 310,
      low: 290,
      close: 300,
      volume: 2000,
    },
  ];

  const config = {
    tp: 0.02, // +2%
    sl: 0.01, // -1%
    feeBps: 5, // 5 bps per side = 0.0005
    slippageBps: 2, // 2 bps per side = 0.0002
    // roundTripCost = (0.0005 + 0.0002) * 2 = 0.0014
  };

  it('returns empty array when labels are empty', () => {
    const trades = buildTrades(candles, [], config);
    expect(trades).toEqual([]);
  });

  it('builds winning trade for label 1 (take-profit)', () => {
    const labels = [
      {
        entryIdx: 0,
        label: 1 as const,
        triggeredAt: 1,
        numBarsScanned: 2,
      },
    ];

    const trades = buildTrades(candles, labels, config);
    expect(trades).toHaveLength(1);

    const trade = trades[0];
    expect(trade.timestamp).toBe('2025-01-01T00:00:00Z');
    expect(trade.side).toBe('BUY');
    expect(trade.size).toBe(1);
    expect(trade.tokenId).toBe('');
    // entryPrice is 100, exitPrice = 100 * (1 + 0.02) = 102
    expect(trade.price).toBeCloseTo(102);
    // netReturn = 0.02 - 0.0014 = 0.0186
    expect(trade.pnl).toBeCloseTo(0.0186);
  });

  it('builds losing trade for label -1 (stop-loss)', () => {
    const labels = [
      {
        entryIdx: 1,
        label: -1 as const,
        triggeredAt: 2,
        numBarsScanned: 2,
      },
    ];

    const trades = buildTrades(candles, labels, config);
    expect(trades).toHaveLength(1);

    const trade = trades[0];
    expect(trade.timestamp).toBe('2025-01-01T01:00:00Z');
    expect(trade.side).toBe('BUY');
    expect(trade.size).toBe(1);
    // entryPrice is 200, exitPrice = 200 * (1 - 0.01) = 198
    expect(trade.price).toBeCloseTo(198);
    // netReturn = -0.01 - 0.0014 = -0.0114
    expect(trade.pnl).toBeCloseTo(-0.0114);
  });

  it('builds timeout trade for label 0 (neither TP nor SL hit)', () => {
    const labels = [
      {
        entryIdx: 2,
        label: 0 as const,
        triggeredAt: 2,
        numBarsScanned: 1,
      },
    ];

    const trades = buildTrades(candles, labels, config);
    expect(trades).toHaveLength(1);

    const trade = trades[0];
    expect(trade.timestamp).toBe('2025-01-01T02:00:00Z');
    expect(trade.side).toBe('BUY');
    // entryPrice is 300, exitPrice = 300
    expect(trade.price).toBeCloseTo(300);
    // netReturn = 0 - 0.0014 = -0.0014
    expect(trade.pnl).toBeCloseTo(-0.0014);
  });
});
