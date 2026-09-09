/**
 * Equity Curve Builder Tests
 *
 * Covers: empty closes, empty trades, null pnl skipping, multiple trades on same
 * bar, and cumulative compounding.
 */

import { describe, it, expect } from 'vitest';
import { buildEquityCurve } from '../equity-curve';
import type { BacktestTrade } from '../../../desk/backtesting/types';

describe('buildEquityCurve', () => {
  it('returns an empty array when closes is empty', () => {
    const trades: BacktestTrade[] = [
      {
        timestamp: '2025-01-01T00:00:00Z',
        tokenId: '',
        side: 'BUY',
        price: 100,
        size: 1,
        pnl: 0.05,
      },
    ];
    const curve = buildEquityCurve([], trades);
    expect(curve).toEqual([]);
  });

  it('returns flat equity curve with value 1 when trades is empty', () => {
    const closes = [
      { timestamp: '2025-01-01T00:00:00Z' },
      { timestamp: '2025-01-01T01:00:00Z' },
    ];
    const curve = buildEquityCurve(closes, []);
    expect(curve).toEqual([
      { timestamp: '2025-01-01T00:00:00Z', equity: 1 },
      { timestamp: '2025-01-01T01:00:00Z', equity: 1 },
    ]);
  });

  it('compounds trade PnL chronologically over candle bars', () => {
    const closes = [
      { timestamp: '2025-01-01T00:00:00Z' },
      { timestamp: '2025-01-01T01:00:00Z' },
      { timestamp: '2025-01-01T02:00:00Z' },
    ];
    const trades: BacktestTrade[] = [
      {
        timestamp: '2025-01-01T00:00:00Z',
        tokenId: '',
        side: 'BUY',
        price: 100,
        size: 1,
        pnl: 0.1, // +10%
      },
      {
        timestamp: '2025-01-01T02:00:00Z',
        tokenId: '',
        side: 'BUY',
        price: 110,
        size: 1,
        pnl: -0.05, // -5%
      },
    ];

    const curve = buildEquityCurve(closes, trades);
    expect(curve).toHaveLength(3);
    expect(curve[0].equity).toBeCloseTo(1.1);
    expect(curve[1].equity).toBeCloseTo(1.1); // no trade on bar 1
    expect(curve[2].equity).toBeCloseTo(1.1 * 0.95);
  });

  it('skips unconverted trades where pnl is null', () => {
    const closes = [{ timestamp: '2025-01-01T00:00:00Z' }];
    const trades: BacktestTrade[] = [
      {
        timestamp: '2025-01-01T00:00:00Z',
        tokenId: '',
        side: 'BUY',
        price: 100,
        size: 1,
        pnl: null,
      },
    ];

    const curve = buildEquityCurve(closes, trades);
    expect(curve).toEqual([{ timestamp: '2025-01-01T00:00:00Z', equity: 1 }]);
  });

  it('nets multiple trades occurring on the exact same timestamp', () => {
    const closes = [{ timestamp: '2025-01-01T00:00:00Z' }];
    const trades: BacktestTrade[] = [
      {
        timestamp: '2025-01-01T00:00:00Z',
        tokenId: '',
        side: 'BUY',
        price: 100,
        size: 1,
        pnl: 0.05,
      },
      {
        timestamp: '2025-01-01T00:00:00Z',
        tokenId: '',
        side: 'BUY',
        price: 102,
        size: 1,
        pnl: -0.02,
      },
    ];

    const curve = buildEquityCurve(closes, trades);
    expect(curve).toHaveLength(1);
    expect(curve[0].equity).toBeCloseTo(1 + 0.03);
  });
});
