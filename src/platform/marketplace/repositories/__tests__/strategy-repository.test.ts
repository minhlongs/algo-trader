/**
 * Tests for StrategyRepository
 * Covers: findById, findAll (with filters/sort/pagination), create,
 *         update (with column mapping, empty fields), delete, count,
 *         updateStatus, findByStatus (with filters), findLatestPerformance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../../shared/db/postgres-client', () => ({
  query: mockQuery,
}));

import { StrategyRepository } from '../strategy-repository';

function mockResult(rows: unknown[] = [], rowCount?: number) {
  return { rows, rowCount: rowCount ?? rows.length } as never;
}

describe('StrategyRepository', () => {
  let repo: StrategyRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new StrategyRepository();
  });

  // ── findById ──

  describe('findById', () => {
    it('returns strategy when found', async () => {
      const strategy = { id: 's1', name: 'Test' };
      mockQuery.mockResolvedValueOnce(mockResult([strategy]));

      const result = await repo.findById('s1');

      expect(result).toEqual(strategy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['s1'],
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns paginated results with default pagination', async () => {
      const strategies = [{ id: 's1' }, { id: 's2' }];
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 2 }]))
        .mockResolvedValueOnce(mockResult(strategies));

      const result = await repo.findAll();

      expect(result.data).toEqual(strategies);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('applies tenantId filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ tenantId: 't1' });

      expect(mockQuery.mock.calls[0][0]).toContain('tenant_id = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('t1');
    });

    it('applies creatorId filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ creatorId: 'c1' });

      expect(mockQuery.mock.calls[0][0]).toContain('creator_id = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('c1');
    });

    it('applies status filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ status: 'active' });

      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });

    it('applies category filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ category: 'defi' });

      expect(mockQuery.mock.calls[0][0]).toContain('category = $1');
    });

    it('applies search filter with ILIKE', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ search: 'alpha' });

      expect(mockQuery.mock.calls[0][0]).toContain('ILIKE');
      expect(mockQuery.mock.calls[0][1]).toContain('%alpha%');
    });

    it('applies multiple filters combined', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ tenantId: 't1', status: 'active', category: 'defi' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id = $1');
      expect(sql).toContain('status = $2');
      expect(sql).toContain('category = $3');
    });

    it('applies custom sort', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({}, undefined, { field: 'name', order: 'asc' });

      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY name asc');
    });

    it('uses default sort (created_at desc)', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll();

      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY created_at desc');
    });

    it('applies custom pagination', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 50 }]))
        .mockResolvedValueOnce(mockResult([]));

      const result = await repo.findAll({}, { page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(5);
      const dataSql = mockQuery.mock.calls[1][0];
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
    });
  });

  // ── create ──

  describe('create', () => {
    it('inserts a strategy with all fields', async () => {
      const strategy = { id: 's1', name: 'Alpha' };
      mockQuery.mockResolvedValueOnce(mockResult([strategy]));

      const result = await repo.create({
        id: 's1',
        tenantId: 't1',
        creatorId: 'c1',
        name: 'Alpha',
        description: 'A strategy',
        category: 'defi',
        riskLevel: 'medium',
        minAllocationUsd: 100,
        maxAllocationUsd: 10000,
        supportedExchanges: ['binance'],
        tags: ['defi'],
      });

      expect(result).toEqual(strategy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['s1', 't1', 'c1', 'Alpha']),
      );
    });

    it('uses defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 's2' }]));

      await repo.create({ id: 's2', name: 'Beta' });

      const params = mockQuery.mock.calls[0][1];
      expect(params[6]).toBe('draft'); // status default
      expect(params[10]).toEqual([]); // supportedExchanges default
      expect(params[11]).toEqual([]); // tags default
      expect(params[12]).toBeNull(); // backtestSummary default
      expect(params[13]).toBeNull(); // vettedAt default
      expect(params[14]).toBeNull(); // vettedBy default
      expect(params[15]).toBeNull(); // rejectionReason default
    });
  });

  // ── update ──

  describe('update', () => {
    it('updates mapped fields (camelCase → snake_case)', async () => {
      const updated = { id: 's1', tenant_id: 't2' };
      mockQuery.mockResolvedValueOnce(mockResult([updated]));

      const result = await repo.update('s1', { tenantId: 't2', creatorId: 'c2' });

      expect(result).toEqual(updated);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id = $1');
      expect(sql).toContain('creator_id = $2');
      expect(sql).toContain('WHERE id =');
    });

    it('updates direct fields (name, description, category, status, tags)', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 's1' }]));

      await repo.update('s1', { name: 'New Name', description: 'New Desc' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('name =');
      expect(sql).toContain('description =');
    });

    it('updates category, status, and tags direct fields', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 's1' }]));

      await repo.update('s1', { category: 'defi', status: 'active', tags: ['t1'] });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('category =');
      expect(sql).toContain('status =');
      expect(sql).toContain('tags =');
    });

    it('returns findById result when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 's1' }]));

      const result = await repo.update('s1', {});

      expect(result).toEqual({ id: 's1' });
      // findById issues a SELECT, not UPDATE
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT *');
    });

    it('returns null when update returns empty result', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await repo.update('missing', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  // ── delete ──

  describe('delete', () => {
    it('returns true when row is deleted', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([], 1));

      const result = await repo.delete('s1');
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        ['s1'],
      );
    });

    it('returns false when no rows deleted', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([], 0));

      const result = await repo.delete('missing');
      expect(result).toBe(false);
    });

    it('handles null rowCount', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: null } as never);

      const result = await repo.delete('s1');
      expect(result).toBe(false);
    });
  });

  // ── count ──

  describe('count', () => {
    it('counts all when no filters', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 42 }]));

      const result = await repo.count();
      expect(result).toBe(42);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        [],
      );
    });

    it('counts with tenantId filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 5 }]));

      const result = await repo.count({ tenantId: 't1' });
      expect(result).toBe(5);
      expect(mockQuery.mock.calls[0][0]).toContain('tenant_id = $1');
    });

    it('counts with status filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 3 }]));

      await repo.count({ status: 'active' });
      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });

    it('counts with category filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 7 }]));

      await repo.count({ category: 'defi' });
      expect(mockQuery.mock.calls[0][0]).toContain('category = $1');
    });

    it('counts with multiple filters', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 2 }]));

      await repo.count({ tenantId: 't1', status: 'active', category: 'defi' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id = $1');
      expect(sql).toContain('status = $2');
      expect(sql).toContain('category = $3');
    });
  });

  // ── updateStatus ──

  describe('updateStatus', () => {
    it('updates status and returns strategy', async () => {
      const strategy = { id: 's1', status: 'active' };
      mockQuery.mockResolvedValueOnce(mockResult([strategy]));

      const result = await repo.updateStatus('s1', 'active');

      expect(result).toEqual(strategy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1'),
        ['active', 's1'],
      );
    });

    it('returns null when strategy not found', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await repo.updateStatus('missing', 'active');
      expect(result).toBeNull();
    });
  });

  // ── findByStatus ──

  describe('findByStatus', () => {
    it('finds by status alone', async () => {
      const strategies = [{ id: 's1' }];
      mockQuery.mockResolvedValueOnce(mockResult(strategies));

      const result = await repo.findByStatus('active');

      expect(result).toEqual(strategies);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $1'),
        expect.arrayContaining(['active']),
      );
    });

    it('applies category filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      await repo.findByStatus('active', { category: 'defi' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('category = $2');
    });

    it('applies creatorId filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      await repo.findByStatus('active', { creatorId: 'c1' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('creator_id = $2');
    });

    it('applies custom limit', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      await repo.findByStatus('active', { limit: 10 });

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(10);
    });

    it('uses default limit of 50', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      await repo.findByStatus('active');

      const params = mockQuery.mock.calls[0][1];
      expect(params).toContain(50);
    });

    it('combines all filters', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      await repo.findByStatus('active', { category: 'defi', creatorId: 'c1', limit: 25 });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('status = $1');
      expect(sql).toContain('category = $2');
      expect(sql).toContain('creator_id = $3');
    });
  });

  // ── findLatestPerformance ──

  describe('findLatestPerformance', () => {
    it('returns performance when found', async () => {
      const perf = { id: 'p1', strategy_id: 's1' };
      mockQuery.mockResolvedValueOnce(mockResult([perf]));

      const result = await repo.findLatestPerformance('s1');

      expect(result).toEqual(perf);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('marketplace_performance'),
        ['s1'],
      );
    });

    it('returns null when no performance found', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await repo.findLatestPerformance('missing');
      expect(result).toBeNull();
    });
  });

  // ── instance export ──

  describe('singleton export', () => {
    it('exports strategyRepository instance', async () => {
      const { strategyRepository } = await import('../strategy-repository');
      expect(strategyRepository).toBeInstanceOf(StrategyRepository);
    });
  });
});
