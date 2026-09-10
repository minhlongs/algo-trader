/**
 * Tests for ReviewRepository — mocked `query` so all methods are exercised
 * without a live database. Verifies SQL shape, param binding, and result mapping.
 * Target: 100% coverage for src/platform/marketplace/repositories/review-repository.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../../../src/shared/db/postgres-client', () => ({
  query: vi.fn((...args: unknown[]) => mockQuery(...args)),
}));

import { ReviewRepository, reviewRepository } from '../../../../../src/platform/marketplace/repositories/review-repository';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const REVIEW = {
  id: 'review_001',
  tenantId: 'tenant_001',
  strategyId: 'strat_001',
  subscriptionId: 'sub_001',
  rating: 5,
  comment: 'Excellent strategy',
  isVerified: true,
  helpfulVotes: 10,
  reportedCount: 0,
  isFlagged: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReviewRepository', () => {
  let repo: ReviewRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new ReviewRepository();
  });

  it('exposes a module-level singleton instance', () => {
    expect(reviewRepository).toBeInstanceOf(ReviewRepository);
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the record when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVIEW] });
      const result = await repo.findById('review_001');
      expect(result).toEqual(REVIEW);
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('uses table marketplace_reviews and param id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findById('review_007');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_reviews');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual(['review_007']);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated result with defaults (limit 20, page 1, created_at desc)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 30 }] }) // count
        .mockResolvedValueOnce({ rows: [REVIEW] });        // data
      const result = await repo.findAll();
      expect(result).toEqual({
        data: [REVIEW], total: 30, page: 1, limit: 20, totalPages: 2,
      });
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY created_at desc');
      expect(dataParams.slice(-2)).toEqual([20, 0]);
    });

    it('applies all filters with AND and increments param indexes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [REVIEW] });
      await repo.findAll(
        { strategyId: 's1', tenantId: 't1', isFlagged: true, minRating: 3 },
        { limit: 10, page: 3 },
        { field: 'id', order: 'asc' },
      );
      const [countSql, countParams] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1 AND tenant_id = $2 AND is_flagged = $3 AND rating >= $4');
      expect(countParams.slice(0, 4)).toEqual(['s1', 't1', true, 3]);
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY id asc');
      expect(dataSql).toContain('LIMIT $5 OFFSET $6');
      expect(dataParams).toEqual(['s1', 't1', true, 3, 10, 20]);
    });

    it('supports single filter strategyId only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ strategyId: 's1' }, { limit: 5, page: 1 });
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(1);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1');
    });

    it('supports single filter tenantId only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ tenantId: 't1' });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE tenant_id = $1');
    });

    it('supports single filter isFlagged only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ isFlagged: false });
      expect(result.total).toBe(2);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE is_flagged = $1');
    });

    it('supports single filter minRating only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 8 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ minRating: 4 });
      expect(result.total).toBe(8);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE rating >= $1');
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

    it('uses default sort field created_at when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.findAll(undefined, undefined, { order: 'asc' });
      const [dataSql] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY created_at asc');
    });

    it('parses string total from COUNT(*)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '15' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll();
      expect(result.total).toBe(15);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('inserts with all fields and returns the new record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVIEW] });
      const result = await repo.create({
        id: 'review_001',
        tenantId: 'tenant_001',
        strategyId: 'strat_001',
        subscriptionId: 'sub_001',
        rating: 5,
        comment: 'Excellent strategy',
        isVerified: true,
      });
      expect(result).toEqual(REVIEW);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO marketplace_reviews');
      expect(sql).toContain('NOW()');
      expect(params).toEqual([
        'review_001', 'tenant_001', 'strat_001', 'sub_001',
        5, 'Excellent strategy', true,
      ]);
    });

    it('sets defaults: helpful_votes=0, reported_count=0, is_flagged=false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVIEW] });
      await repo.create({
        id: 'r', tenantId: 't', strategyId: 's', subscriptionId: 'sub',
        rating: 3, comment: 'ok', isVerified: false,
      });
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('0, 0, false');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates multiple fields and returns updated record', async () => {
      const updated = { ...REVIEW, rating: 4, comment: 'Good' };
      mockQuery.mockResolvedValueOnce({ rows: [updated] });
      const result = await repo.update('review_001', { rating: 4, comment: 'Good' });
      expect(result).toEqual(updated);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_reviews SET rating = $1, comment = $2');
      expect(sql).toContain('WHERE id = $3');
      expect(params).toEqual([4, 'Good', 'review_001']);
    });

    it('updates isVerified column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...REVIEW, isVerified: false }] });
      const result = await repo.update('review_001', { isVerified: false });
      expect(result?.isVerified).toBe(false);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('is_verified = $1');
      expect(params[0]).toBe(false);
    });

    it('updates helpfulVotes column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...REVIEW, helpfulVotes: 15 }] });
      const result = await repo.update('review_001', { helpfulVotes: 15 });
      expect(result?.helpfulVotes).toBe(15);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('helpful_votes = $1');
    });

    it('updates reportedCount column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...REVIEW, reportedCount: 1 }] });
      const result = await repo.update('review_001', { reportedCount: 1 });
      expect(result?.reportedCount).toBe(1);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('reported_count = $1');
    });

    it('updates isFlagged column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...REVIEW, isFlagged: true }] });
      const result = await repo.update('review_001', { isFlagged: true });
      expect(result?.isFlagged).toBe(true);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('is_flagged = $1');
    });

    it('returns existing record when no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVIEW] });
      const result = await repo.update('review_001', {});
      expect(result).toEqual(REVIEW);
    });

    it('returns null when rowCount is 0 (id not found)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.update('nonexistent', { rating: 1 });
      expect(result).toBeNull();
    });

    it('handles empty params correctly for single field update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVIEW] });
      await repo.update('review_001', { rating: 4 });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE id = $2');
      expect(params).toEqual([4, 'review_001']);
    });
  });

  // ─── incrementHelpful ──────────────────────────────────────────────────────

  describe('incrementHelpful', () => {
    it('executes increment SQL with correct id', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await repo.incrementHelpful('review_001');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_reviews SET helpful_votes = helpful_votes + 1');
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual(['review_001']);
    });
  });

  // ─── incrementReported ─────────────────────────────────────────────────────

  describe('incrementReported', () => {
    it('executes increment SQL with correct id', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await repo.incrementReported('review_001');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_reviews SET reported_count = reported_count + 1');
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual(['review_001']);
    });
  });

  // ─── findBySubscriptionId ──────────────────────────────────────────────────

  describe('findBySubscriptionId', () => {
    it('returns the record when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVIEW] });
      const result = await repo.findBySubscriptionId('sub_001');
      expect(result).toEqual(REVIEW);
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findBySubscriptionId('nonexistent');
      expect(result).toBeNull();
    });

    it('uses correct table and param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findBySubscriptionId('sub_007');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_reviews');
      expect(sql).toContain('WHERE subscription_id = $1');
      expect(params).toEqual(['sub_007']);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('returns true when rowCount > 0', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const result = await repo.delete('review_001');
      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM marketplace_reviews');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual(['review_001']);
    });

    it('returns false when rowCount is 0', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const result = await repo.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when rowCount is undefined', async () => {
      mockQuery.mockResolvedValueOnce({});
      const result = await repo.delete('review_001');
      expect(result).toBe(false);
    });
  });

  // ─── count ──────────────────────────────────────────────────────────────────

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

    it('applies tenantId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
      const result = await repo.count({ tenantId: 't1' });
      expect(result).toBe(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['t1']);
    });

    it('applies both filters together', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await repo.count({ strategyId: 's1', tenantId: 't1' });
      expect(result).toBe(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1 AND tenant_id = $2');
      expect(params).toEqual(['s1', 't1']);
    });

    it('parses string total from COUNT(*)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '7' }] });
      const result = await repo.count();
      expect(result).toBe(7);
    });
  });

  // ─── getAverageRating ──────────────────────────────────────────────────────

  describe('getAverageRating', () => {
    it('returns avg and count from DB row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg: '4.5', count: '10' }] });
      const result = await repo.getAverageRating('strat_001');
      expect(result).toEqual({ avg: 4.5, count: 10 });
    });

    it('returns zero avg and count when row is undefined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.getAverageRating('nonexistent');
      expect(result).toEqual({ avg: 0, count: 0 });
    });

    it('handles null avg from DB', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg: null, count: '0' }] });
      const result = await repo.getAverageRating('strat_001');
      expect(result).toEqual({ avg: 0, count: 0 });
    });

    it('uses correct table, filters flagged reviews', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg: '3.8', count: '5' }] });
      await repo.getAverageRating('strat_001');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_reviews');
      expect(sql).toContain('WHERE strategy_id = $1 AND is_flagged = false');
      expect(params).toEqual(['strat_001']);
    });

    it('parses numeric avg correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ avg: '4.25', count: '8' }] });
      const result = await repo.getAverageRating('strat_001');
      expect(result.avg).toBeCloseTo(4.25);
    });
  });
});