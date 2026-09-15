/**
 * Equity Snapshot Manager Tests — Record, GetRecent, GetRange
 * Validates snapshot recording, throttling, retrieval, and query bounds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });
const mockGetDbClient = vi.fn().mockReturnValue({ connect: mockConnect });

vi.mock('../../../db/postgres-client', () => ({
  getDbClient: (...args: unknown[]) => mockGetDbClient(...args),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { EquitySnapshotManager } from '../equity-snapshot-manager';
import { SNAPSHOT_INPUT } from './equity-snapshot-manager-fixtures';

const DEFAULT_ROW = {
  id: 1, timestamp: 1_700_000_000_000, total_equity: '10000', cash_balance: '5000',
  unrealized_pnl: '250', realized_pnl_daily: '120', open_positions: 3,
  drawdown_pct: '0.02', metadata: { strategy: 'arb-v2' },
};

describe('EquitySnapshotManager — Record & Retrieve', () => {
  let mgr: EquitySnapshotManager;

  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    mgr = new EquitySnapshotManager({ minIntervalMs: 60_000 });
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inserts a snapshot and returns it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DEFAULT_ROW], rowCount: 1 });
    const result = await mgr.recordSnapshot(SNAPSHOT_INPUT);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.totalEquity).toBe(10_000);
    expect(result!.cashBalance).toBe(5_000);
    expect(result!.metadata).toEqual({ strategy: 'arb-v2' });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO equity_snapshots'),
      expect.arrayContaining([10_000, 5_000, 250, 120, 3, 0.02]),
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  it('returns null when throttled (within minIntervalMs)', async () => {
    mockQuery.mockResolvedValue({ rows: [DEFAULT_ROW], rowCount: 1 });
    await mgr.recordSnapshot(SNAPSHOT_INPUT);
    const result = await mgr.recordSnapshot(SNAPSHOT_INPUT);
    expect(result).toBeNull();
  });

  it('allows recording after minIntervalMs has passed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DEFAULT_ROW], rowCount: 1 });
    await mgr.recordSnapshot(SNAPSHOT_INPUT);
    vi.advanceTimersByTime(60_001);

    mockQuery.mockResolvedValueOnce({
      rows: [{ ...DEFAULT_ROW, id: 2, timestamp: 1_700_000_60_001 }],
      rowCount: 1,
    });
    const result = await mgr.recordSnapshot(SNAPSHOT_INPUT);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(2);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns null on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const result = await mgr.recordSnapshot(SNAPSHOT_INPUT);
    expect(result).toBeNull();
  });

  it('defaults metadata to empty object when omitted', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...DEFAULT_ROW, metadata: null }],
      rowCount: 1,
    });
    const result = await mgr.recordSnapshot({ ...SNAPSHOT_INPUT, metadata: undefined });
    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual({});
  });

  it('returns snapshots ordered by timestamp DESC', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 2, timestamp: 1_700_000_060_000, total_equity: '10200', cash_balance: '5100',
          unrealized_pnl: '300', realized_pnl_daily: '150', open_positions: 4,
          drawdown_pct: '0.01', metadata: {} },
        { ...DEFAULT_ROW, metadata: { strategy: 'arb' } },
      ],
    });

    const results = await mgr.getRecent(10);
    expect(results).toHaveLength(2);
    expect(results[0].totalEquity).toBe(10_200);
    expect(results[1].totalEquity).toBe(10_000);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY timestamp DESC'),
      [10],
    );
  });

  it('returns empty array on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const results = await mgr.getRecent();
    expect(results).toEqual([]);
  });

  it('queries with correct time bounds', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await mgr.getRange(1_700_000_000_000, 1_700_000_060_000);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE timestamp >= $1 AND timestamp <= $2'),
      [1_700_000_000_000, 1_700_000_060_000],
    );
  });
});
