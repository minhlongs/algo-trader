import { describe, it, expect } from 'vitest';

import { rowToSnapshot, EquitySnapshot } from '../equity-snapshot-types';

const baseRow: Record<string, unknown> = {
  id: 1,
  timestamp: 1_600_000_000_000,
  total_equity: '123456.789',
  cash_balance: '1000.50',
  unrealized_pnl: '250.125',
  realized_pnl_daily: '-12.5',
  open_positions: 3,
  drawdown_pct: '5.75',
  metadata: { strategy: 'test', version: 1 },
};

describe('rowToSnapshot', () => {
  it('converts a standard row to an EquitySnapshot', () => {
    const snapshot = rowToSnapshot(baseRow);
    expect(snapshot).toEqual({
      id: 1,
      timestamp: 1_600_000_000_000,
      totalEquity: 123456.789,
      cashBalance: 1000.5,
      unrealizedPnl: 250.125,
      realizedPnlDaily: -12.5,
      openPositions: 3,
      drawdownPct: 5.75,
      metadata: { strategy: 'test', version: 1 },
    });
  });

  it('returns default metadata when row.metadata is null', () => {
    const row = { ...baseRow, metadata: null };
    expect(rowToSnapshot(row).metadata).toEqual({});
  });

  it('returns default metadata when row.metadata is undefined', () => {
    const row = { ...baseRow, metadata: undefined };
    expect(rowToSnapshot(row).metadata).toEqual({});
  });

  it('passes through non-null/undefined metadata values as-is (no runtime validation)', () => {
    // rowToSnapshot uses ?? {} (nullish coalescing), not a type guard.
    // Only null/undefined yield {}; truthy non-objects pass through.
    expect(rowToSnapshot({ ...baseRow, metadata: 'invalid' }).metadata).toBe('invalid');
    expect(rowToSnapshot({ ...baseRow, metadata: 123 }).metadata).toBe(123);
    expect(rowToSnapshot({ ...baseRow, metadata: [] }).metadata).toEqual([]);
  });

  it('parses numeric strings as floats', () => {
    const row = {
      ...baseRow,
      total_equity: '0.0001',
      cash_balance: '1e3',
      unrealized_pnl: '1.23e2',
      realized_pnl_daily: '-0.0',
      drawdown_pct: '100',
    };
    const snapshot = rowToSnapshot(row);
    expect(snapshot.totalEquity).toBeCloseTo(0.0001);
    expect(snapshot.cashBalance).toBeCloseTo(1000);
    expect(snapshot.unrealizedPnl).toBeCloseTo(123);
    expect(snapshot.realizedPnlDaily).toBeCloseTo(0);
    expect(snapshot.drawdownPct).toBeCloseTo(100);
  });

  it('handles missing numeric string fields gracefully (NaN)', () => {
    const row = { ...baseRow };
    delete (row as Record<string, unknown>).total_equity;
    const snapshot = rowToSnapshot(row);
    expect(Number.isNaN(snapshot.totalEquity)).toBe(true);
  });

  it('handles missing id/timestamp fields (undefined)', () => {
    const row = { ...baseRow };
    delete (row as Record<string, unknown>).id;
    delete (row as Record<string, unknown>).timestamp;
    const snapshot = rowToSnapshot(row);
    expect(snapshot.id).toBeUndefined();
    expect(snapshot.timestamp).toBeUndefined();
  });
});
