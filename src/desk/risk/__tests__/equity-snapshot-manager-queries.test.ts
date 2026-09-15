/**
 * Equity Snapshot Manager Tests — Daily Returns & Prune
 * Validates return percentage computations and snapshot retention pruning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('EquitySnapshotManager — Queries & Maintenance', () => {
  let mgr: EquitySnapshotManager;

  beforeEach(() => {
    mgr = new EquitySnapshotManager({ minIntervalMs: 60_000 });
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  describe('getDailyReturns()', () => {
    it('computes percentage returns from daily equity values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { total_equity: '10200', day: '2026-08-10' },
          { total_equity: '10000', day: '2026-08-09' },
          { total_equity: '9800', day: '2026-08-08' },
        ],
      });

      const returns = await mgr.getDailyReturns(7);
      expect(returns).toHaveLength(2);
      expect(returns[0]).toBeCloseTo(200 / 10_000, 6);
      expect(returns[1]).toBeCloseTo(200 / 9_800, 6);
    });

    it('returns empty array when no data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const returns = await mgr.getDailyReturns(30);
      expect(returns).toEqual([]);
    });
  });

  describe('prune()', () => {
    it('deletes snapshots older than maxDays', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 150 });
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
