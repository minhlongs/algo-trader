/**
 * Tests for VettingJobRepository — mocked `query` so all methods are exercised
 * without a live database. Verifies SQL shape, param binding, and result mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../../shared/db/postgres-client', () => ({
  query: vi.fn((...args: unknown[]) => mockQuery(...args)),
}));

import { VettingJobRepository, vettingJobRepository } from '../vetting-job-repository';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RECORD = {
  id: 1,
  strategyId: 'strat-1',
  adminId: 'admin-1',
  decision: 'approved',
  notes: 'looks good',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('VettingJobRepository', () => {
  let repo: VettingJobRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new VettingJobRepository();
  });

  it('exposes a module-level singleton instance', () => {
    expect(vettingJobRepository).toBeInstanceOf(VettingJobRepository);
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the record when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [RECORD] });
      const result = await repo.findById(1);
      expect(result).toEqual(RECORD);
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findById(999);
      expect(result).toBeNull();
    });

    it('uses table marketplace_vetting_history and param id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findById(7);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_vetting_history');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual([7]);
    });
  });

  // ─── findByStrategyId ─────────────────────────────────────────────────────

  describe('findByStrategyId', () => {
    it('returns rows ordered by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [RECORD] });
      const result = await repo.findByStrategyId('strat-1');
      expect(result).toEqual([RECORD]);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(params).toEqual(['strat-1']);
    });

    it('returns empty array when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findByStrategyId('none');
      expect(result).toEqual([]);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('inserts with all fields and returns the new record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [RECORD] });
      const result = await repo.create({
        strategyId: 'strat-1',
        adminId: 'admin-1',
        decision: 'approved',
        notes: 'looks good',
      });
      expect(result).toEqual(RECORD);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO marketplace_vetting_history');
      expect(sql).toContain('NOW()');
      expect(params).toEqual(['strat-1', 'admin-1', 'approved', 'looks good']);
    });

    it('passes null when notes omitted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [RECORD] });
      await repo.create({ strategyId: 's', adminId: 'a', decision: 'd' });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBeNull();
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated result with defaults (limit 20, page 1, created_at desc)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 30 }] })  // count
        .mockResolvedValueOnce({ rows: [RECORD] });          // data
      const result = await repo.findAll();
      expect(result).toEqual({
        data: [RECORD], total: 30, page: 1, limit: 20, totalPages: 2,
      });
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY created_at desc');
      expect(dataParams.slice(-2)).toEqual([20, 0]);
    });

    it('applies all three filters with AND and increments param indexes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [RECORD] });
      await repo.findAll(
        { strategyId: 's1', decision: 'approved', adminId: 'a1' },
        { limit: 10, page: 3 },
        { field: 'id', order: 'asc' },
      );
      const [countSql, countParams] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1 AND decision = $2 AND admin_id = $3');
      expect(countParams.slice(0, 3)).toEqual(['s1', 'approved', 'a1']);
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY id asc');
      expect(dataSql).toContain('LIMIT $4 OFFSET $5');
      expect(dataParams).toEqual(['s1', 'approved', 'a1', 10, 20]);
    });

    it('supports single filter decision only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ decision: 'rejected' }, { limit: 5, page: 1 });
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(1);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE decision = $1');
    });

    it('supports single filter adminId only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ adminId: 'a1' });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE admin_id = $1');
    });

    it('computes totalPages with ceiling division', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 41 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll(undefined, { limit: 20 });
      expect(result.totalPages).toBe(3);
    });

    it('offset is zero when page is 1', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 10 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.findAll(undefined, { limit: 10, page: 1 });
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('OFFSET $2');
      expect(dataParams.slice(-2)).toEqual([10, 0]);
    });

    it('handles zero total gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({});
      expect(result).toEqual({
        data: [], total: 0, page: 1, limit: 20, totalPages: 0,
      });
    });
  });

  // ─── count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    it('returns total with no filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 42 }] });
      const result = await repo.count();
      expect(result).toBe(42);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });

    it('applies strategyId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });
      const result = await repo.count({ strategyId: 's1' });
      expect(result).toBe(3);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1');
      expect(params).toEqual(['s1']);
    });

    it('applies decision filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
      const result = await repo.count({ decision: 'approved' });
      expect(result).toBe(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE decision = $1');
      expect(params).toEqual(['approved']);
    });

    it('applies both filters together', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await repo.count({ strategyId: 's1', decision: 'approved' });
      expect(result).toBe(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1 AND decision = $2');
      expect(params).toEqual(['s1', 'approved']);
    });

    it('parses string total from COUNT(*)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '7' }] });
      const result = await repo.count();
      expect(result).toBe(7);
    });
  });

  // ─── complete ──────────────────────────────────────────────────────────────

  describe('complete', () => {
    it('appends completion suffix to notes and returns true when row updated', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const result = await repo.complete(5, { approved: true, score: 0.95, feedback: 'solid' });
      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("COALESCE(notes, '') || $1");
      expect(params[0]).toContain('[Completed: approved=true, score=0.95] solid');
      expect(params[1]).toBe(5);
    });

    it('returns false when rowCount is 0 (id not found)', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const result = await repo.complete(999, { approved: false, score: 0, feedback: 'nope' });
      expect(result).toBe(false);
    });

    it('returns false when rowCount undefined', async () => {
      mockQuery.mockResolvedValueOnce({});
      const result = await repo.complete(1, { approved: true, score: 1, feedback: 'ok' });
      expect(result).toBe(false);
    });

    it('formats approved=false in suffix', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await repo.complete(2, { approved: false, score: 0.3, feedback: 'weak' });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toContain('[Completed: approved=false, score=0.3] weak');
    });
  });
});
