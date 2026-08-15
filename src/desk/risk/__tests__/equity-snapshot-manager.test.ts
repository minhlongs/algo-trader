/**
 * Unit tests for EquitySnapshotManager.
 *
 * Mocks the PostgreSQL pool client to verify snapshot record/retrieve/throttle
 * behavior without requiring a live database connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SNAPSHOT_INPUT = {
  totalEquity: 10_000,
  cashBalance: 5_000,
  unrealizedPnl: 250,
  realizedPnlDaily: 120,
  openPositions: 3,
  drawdownPct: 0.02,
  metadata: { strategy: 'arb-v2' },
};

function mockInsertResult(id = 42) {
  mockQuery.mockResolvedValueOnce({
    rows: [{
      id,
      timestamp: 1_700_000_000_000,
      total_equity: '10000',
      cash_balance: '5000',
      unrealized_pnl: '250',
      realized_pnl_daily: '120',
      open_positions: 3,
      drawdown_pct: '0.02',
      metadata: { strategy: 'arb-v2' },
    }],
    rowCount: 1,
  });
}

function mockSelectResult(rows: Record<string, unknown>[]) {
  mockQuery.mockResolvedValueOnce({ rows });
}

function mockDeleteResult(rowCount: number) {
  mockQuery.mockResolvedValueOnce({ rowCount });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EquitySnapshotManager', () => {
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

  // ── recordSnapshot() ──────────────────────────────────────────────────────

  describe('record()', () => {
    it('inserts a snapshot and returns it', async () => {
      mockInsertResult(1);
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
      mockInsertResult(1);
      await mgr.recordSnapshot(SNAPSHOT_INPUT);

      // Second call within 60s window → throttled
      const result = await mgr.recordSnapshot(SNAPSHOT_INPUT);
      expect(result).toBeNull();
    });

    it('allows recording after minIntervalMs has passed', async () => {
      mockInsertResult(1);
      await mgr.recordSnapshot(SNAPSHOT_INPUT);

      vi.advanceTimersByTime(60_001);

      mockInsertResult(2);
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
      // Mock returns row with null metadata (simulates DB returning null)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          timestamp: 1_700_000_000_000,
          total_equity: '10000',
          cash_balance: '5000',
          unrealized_pnl: '250',
          realized_pnl_daily: '120',
          open_positions: 3,
          drawdown_pct: '0.02',
          metadata: null,
        }],
        rowCount: 1,
      });
      const input = { ...SNAPSHOT_INPUT, metadata: undefined };
      const result = await mgr.recordSnapshot(input);

      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual({});
    });
  });

  // ── getRecent() ───────────────────────────────────────────────────────────

  describe('getRecent()', () => {
    it('returns snapshots ordered by timestamp DESC', async () => {
      mockSelectResult([
        { id: 2, timestamp: 1_700_000_060_000, total_equity: '10200', cash_balance: '5100',
          unrealized_pnl: '300', realized_pnl_daily: '150', open_positions: 4,
          drawdown_pct: '0.01', metadata: {} },
        { id: 1, timestamp: 1_700_000_000_000, total_equity: '10000', cash_balance: '5000',
          unrealized_pnl: '250', realized_pnl_daily: '120', open_positions: 3,
          drawdown_pct: '0.02', metadata: { strategy: 'arb' } },
      ]);

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
  });

  // ── getRange() ────────────────────────────────────────────────────────────

  describe('getRange()', () => {
    it('queries with correct time bounds', async () => {
      mockSelectResult([]);
      await mgr.getRange(1_700_000_000_000, 1_700_000_060_000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE timestamp >= $1 AND timestamp <= $2'),
        [1_700_000_000_000, 1_700_000_060_000],
      );
    });
  });

  // ── getDailyReturns() ─────────────────────────────────────────────────────

  describe('getDailyReturns()', () => {
    it('computes percentage returns from daily equity values', async () => {
      mockSelectResult([
        { total_equity: '10200', day: '2026-08-10' },
        { total_equity: '10000', day: '2026-08-09' },
        { total_equity: '9800', day: '2026-08-08' },
      ]);

      const returns = await mgr.getDailyReturns(7);
      // Query returns days DESC, so equities = [10200, 10000, 9800]
      // Formula: (equities[i-1] - equities[i]) / equities[i]
      // Returns: (10200-10000)/10000=0.02, (10000-9800)/9800≈0.0204
      expect(returns).toHaveLength(2);
      expect(returns[0]).toBeCloseTo(200 / 10_000, 6);
      expect(returns[1]).toBeCloseTo(200 / 9_800, 6);
    });

    it('returns empty array when no data', async () => {
      mockSelectResult([]);
      const returns = await mgr.getDailyReturns(30);
      expect(returns).toEqual([]);
    });
  });

  // ── pruneOldSnapshots() ───────────────────────────────────────────────────

  describe('prune()', () => {
    it('deletes snapshots older than maxDays', async () => {
      mockDeleteResult(150);
      const deleted = await mgr.pruneOldSnapshots();
      expect(deleted).toBe(150);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM equity_snapshots WHERE timestamp < $1',
        [expect.any(Number)],
      );
    });

    it('returns 0 on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      const deleted = await mgr.pruneOldSnapshots();
      expect(deleted).toBe(0);
    });
  });
});
