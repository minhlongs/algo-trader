/**
 * Tests for PerformanceRepository — mocked `query` so all methods are exercised
 * without a live database. Verifies SQL shape, param binding, and result mapping.
 * Target: 100% coverage for src/platform/marketplace/repositories/performance-repository.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../../../src/shared/db/postgres-client', () => ({
  query: vi.fn((...args: unknown[]) => mockQuery(...args)),
}));

import { PerformanceRepository, performanceRepository } from '../../../../../src/platform/marketplace/repositories/performance-repository';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PERFORMANCE = {
  id: 1,
  strategyId: 'strat_001',
  tenantId: null,
  date: new Date('2026-01-01T00:00:00Z'),
  sharpeRatio: 1.5,
  maxDrawdown: 0.1,
  totalPnlUsd: 1000,
  winRate: 0.6,
  totalTrades: 100,
  winningTrades: 60,
  losingTrades: 40,
  avgWinUsd: 50,
  avgLossUsd: 20,
  profitFactor: 2.5,
  volatility: 0.15,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('PerformanceRepository', () => {
  let repo: PerformanceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PerformanceRepository();
  });

  it('exposes a module-level singleton instance', () => {
    expect(performanceRepository).toBeInstanceOf(PerformanceRepository);
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the record when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.findById(1);
      expect(result).toEqual(PERFORMANCE);
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findById(999);
      expect(result).toBeNull();
    });

    it('uses table marketplace_performance and param id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findById(7);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_performance');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual([7]);
    });
  });

  // ─── findByStrategyAndDate ─────────────────────────────────────────────────

  describe('findByStrategyAndDate', () => {
    it('returns the record when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.findByStrategyAndDate('strat_001', new Date('2026-01-01'));
      expect(result).toEqual(PERFORMANCE);
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findByStrategyAndDate('nonexistent', new Date('2026-01-01'));
      expect(result).toBeNull();
    });

    it('passes tenantId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.findByStrategyAndDate('strat_001', new Date('2026-01-01'), 'tenant_001');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('strategy_id = $1 AND date = $2');
      expect(sql).toContain('(tenant_id = $3 OR tenant_id IS NULL)');
      expect(sql).toContain('ORDER BY tenant_id NULLS LAST LIMIT 1');
      expect(params).toEqual(['strat_001', '2026-01-01', 'tenant_001']);
    });

    it('passes null when tenantId not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findByStrategyAndDate('strat_001', new Date('2026-01-01'));
      const [, params] = mockQuery.mock.calls[0];
      expect(params[2]).toBeNull();
    });

    it('formats date as YYYY-MM-DD', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findByStrategyAndDate('strat_001', new Date('2026-03-15T14:30:00Z'));
      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe('2026-03-15');
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated result with defaults (limit 20, page 1, date desc)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 30 }] }) // count
        .mockResolvedValueOnce({ rows: [PERFORMANCE] });        // data
      const result = await repo.findAll();
      expect(result).toEqual({
        data: [PERFORMANCE], total: 30, page: 1, limit: 20, totalPages: 2,
      });
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY date desc');
      expect(dataParams.slice(-2)).toEqual([20, 0]);
    });

    it('applies all filters with AND and increments param indexes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.findAll(
        { strategyId: 's1', tenantId: 't1', dateFrom: new Date('2026-01-01'), dateTo: new Date('2026-12-31') },
        { limit: 10, page: 3 },
        { field: 'sharpe_ratio', order: 'asc' },
      );
      const [countSql, countParams] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1 AND tenant_id = $2 AND date >= $3 AND date <= $4');
      expect(countParams[0]).toBe('s1');
      expect(countParams[1]).toBe('t1');
      expect(countParams[2]).toBeInstanceOf(Date);
      expect(countParams[3]).toBeInstanceOf(Date);
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY sharpe_ratio asc');
      expect(dataSql).toContain('LIMIT $5 OFFSET $6');
      expect(dataParams.slice(-2)).toEqual([10, 20]);
    });

    it('adds tenant_id IS NULL when tenantId not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.findAll({ strategyId: 's1' });
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1 AND tenant_id IS NULL');
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

    it('supports tenantId filter only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ tenantId: 't1' });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE tenant_id = $1');
    });

    it('supports dateFrom filter only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ dateFrom: new Date('2026-01-01') });
      expect(result.total).toBe(2);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('tenant_id IS NULL AND date >= $1');
    });

    it('supports dateTo filter only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 8 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ dateTo: new Date('2026-12-31') });
      expect(result.total).toBe(8);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('tenant_id IS NULL AND date <= $1');
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

    it('uses default sort field date when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.findAll(undefined, undefined, { order: 'asc' });
      const [dataSql] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY date asc');
    });

    it('uses default sort order desc when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.findAll(undefined, undefined, { field: 'sharpe_ratio' });
      const [dataSql] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY sharpe_ratio desc');
    });

    it('parses string total from COUNT(*)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '15' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll();
      expect(result.total).toBe(15);
    });

    it('handles empty filters object', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.findAll({});
      expect(result.total).toBe(3);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE tenant_id IS NULL');
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('inserts with all fields and returns the new record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.create({
        strategyId: 'strat_001',
        date: new Date('2026-01-01'),
        sharpeRatio: 1.5,
        maxDrawdown: 0.1,
        totalPnlUsd: 1000,
        winRate: 0.6,
        totalTrades: 100,
        winningTrades: 60,
        losingTrades: 40,
        avgWinUsd: 50,
        avgLossUsd: 20,
        profitFactor: 2.5,
        volatility: 0.15,
      });
      expect(result).toEqual(PERFORMANCE);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO marketplace_performance');
      expect(sql).toContain('NOW()');
      expect(sql).toContain('RETURNING *');
      expect(params[0]).toBe('strat_001');
      expect(params[1]).toBeNull();
      expect(params[2]).toBeInstanceOf(Date);
      expect(params[3]).toBe(1.5);
      expect(params[4]).toBe(0.1);
      expect(params[5]).toBe(1000);
      expect(params[6]).toBe(0.6);
      expect(params[7]).toBe(100);
      expect(params[8]).toBe(60);
      expect(params[9]).toBe(40);
      expect(params[10]).toBe(50);
      expect(params[11]).toBe(20);
      expect(params[12]).toBe(2.5);
      expect(params[13]).toBe(0.15);
    });

    it('sets defaults: totalPnlUsd=0, totalTrades=0, winningTrades=0, losingTrades=0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.create({
        strategyId: 'strat_001',
        date: new Date('2026-01-01'),
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[5]).toBe(0); // totalPnlUsd
      expect(params[7]).toBe(0); // totalTrades
      expect(params[8]).toBe(0); // winningTrades
      expect(params[9]).toBe(0); // losingTrades
    });

    it('sets optional fields to null when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.create({
        strategyId: 'strat_001',
        date: new Date('2026-01-01'),
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[3]).toBeNull(); // sharpeRatio
      expect(params[4]).toBeNull(); // maxDrawdown
      expect(params[6]).toBeNull(); // winRate
      expect(params[10]).toBeNull(); // avgWinUsd
      expect(params[11]).toBeNull(); // avgLossUsd
      expect(params[12]).toBeNull(); // profitFactor
      expect(params[13]).toBeNull(); // volatility
    });

    it('passes tenantId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.create({
        strategyId: 'strat_001',
        tenantId: 'tenant_001',
        date: new Date('2026-01-01'),
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe('tenant_001');
    });
  });

  // ─── upsert ────────────────────────────────────────────────────────────────

  describe('upsert', () => {
    it('inserts with ON CONFLICT DO UPDATE and returns the record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.upsert({
        strategyId: 'strat_001',
        date: new Date('2026-01-01'),
        sharpeRatio: 1.5,
        maxDrawdown: 0.1,
        totalPnlUsd: 1000,
        winRate: 0.6,
        totalTrades: 100,
        winningTrades: 60,
        losingTrades: 40,
        avgWinUsd: 50,
        avgLossUsd: 20,
        profitFactor: 2.5,
        volatility: 0.15,
      });
      expect(result).toEqual(PERFORMANCE);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO marketplace_performance');
      expect(sql).toContain('ON CONFLICT (strategy_id, tenant_id, date) DO UPDATE SET');
      expect(sql).toContain('sharpe_ratio = EXCLUDED.sharpe_ratio');
      expect(sql).toContain('max_drawdown = EXCLUDED.max_drawdown');
      expect(sql).toContain('total_pnl_usd = EXCLUDED.total_pnl_usd');
      expect(sql).toContain('win_rate = EXCLUDED.win_rate');
      expect(sql).toContain('total_trades = EXCLUDED.total_trades');
      expect(sql).toContain('winning_trades = EXCLUDED.winning_trades');
      expect(sql).toContain('losing_trades = EXCLUDED.losing_trades');
      expect(sql).toContain('avg_win_usd = EXCLUDED.avg_win_usd');
      expect(sql).toContain('avg_loss_usd = EXCLUDED.avg_loss_usd');
      expect(sql).toContain('profit_factor = EXCLUDED.profit_factor');
      expect(sql).toContain('volatility = EXCLUDED.volatility');
      expect(sql).toContain('updated_at = NOW()');
      expect(params[0]).toBe('strat_001');
      expect(params[1]).toBeNull();
    });

    it('sets defaults: totalPnlUsd=0, totalTrades=0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.upsert({
        strategyId: 'strat_001',
        date: new Date('2026-01-01'),
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[5]).toBe(0); // totalPnlUsd
      expect(params[7]).toBe(0); // totalTrades
      expect(params[8]).toBe(0); // winningTrades
      expect(params[9]).toBe(0); // losingTrades
    });

    it('passes tenantId when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.upsert({
        strategyId: 'strat_001',
        tenantId: 'tenant_001',
        date: new Date('2026-01-01'),
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe('tenant_001');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates multiple fields and returns updated record', async () => {
      const updated = { ...PERFORMANCE, sharpeRatio: 2.0, maxDrawdown: 0.05 };
      mockQuery.mockResolvedValueOnce({ rows: [updated] });
      const result = await repo.update(1, { sharpeRatio: 2.0, maxDrawdown: 0.05 });
      expect(result).toEqual(updated);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_performance SET sharpe_ratio = $1, max_drawdown = $2');
      expect(sql).toContain('updated_at = NOW()');
      expect(sql).toContain('WHERE id = $3');
      expect(params).toEqual([2.0, 0.05, 1]);
    });

    it('updates sharpeRatio column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, sharpeRatio: 2.5 }] });
      const result = await repo.update(1, { sharpeRatio: 2.5 });
      expect(result?.sharpeRatio).toBe(2.5);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('sharpe_ratio = $1');
    });

    it('updates maxDrawdown column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, maxDrawdown: 0.2 }] });
      const result = await repo.update(1, { maxDrawdown: 0.2 });
      expect(result?.maxDrawdown).toBe(0.2);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('max_drawdown = $1');
    });

    it('updates totalPnlUsd column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, totalPnlUsd: 2000 }] });
      const result = await repo.update(1, { totalPnlUsd: 2000 });
      expect(result?.totalPnlUsd).toBe(2000);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('total_pnl_usd = $1');
    });

    it('updates winRate column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, winRate: 0.7 }] });
      const result = await repo.update(1, { winRate: 0.7 });
      expect(result?.winRate).toBe(0.7);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('win_rate = $1');
    });

    it('updates totalTrades column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, totalTrades: 200 }] });
      const result = await repo.update(1, { totalTrades: 200 });
      expect(result?.totalTrades).toBe(200);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('total_trades = $1');
    });

    it('updates winningTrades column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, winningTrades: 120 }] });
      const result = await repo.update(1, { winningTrades: 120 });
      expect(result?.winningTrades).toBe(120);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('winning_trades = $1');
    });

    it('updates losingTrades column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, losingTrades: 80 }] });
      const result = await repo.update(1, { losingTrades: 80 });
      expect(result?.losingTrades).toBe(80);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('losing_trades = $1');
    });

    it('updates avgWinUsd column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, avgWinUsd: 100 }] });
      const result = await repo.update(1, { avgWinUsd: 100 });
      expect(result?.avgWinUsd).toBe(100);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('avg_win_usd = $1');
    });

    it('updates avgLossUsd column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, avgLossUsd: 30 }] });
      const result = await repo.update(1, { avgLossUsd: 30 });
      expect(result?.avgLossUsd).toBe(30);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('avg_loss_usd = $1');
    });

    it('updates profitFactor column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, profitFactor: 3.0 }] });
      const result = await repo.update(1, { profitFactor: 3.0 });
      expect(result?.profitFactor).toBe(3.0);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('profit_factor = $1');
    });

    it('updates volatility column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...PERFORMANCE, volatility: 0.25 }] });
      const result = await repo.update(1, { volatility: 0.25 });
      expect(result?.volatility).toBe(0.25);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('volatility = $1');
    });

    it('returns existing record when no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.update(1, {});
      expect(result).toEqual(PERFORMANCE);
    });

    it('returns null when rowCount is 0 (id not found)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.update(999, { sharpeRatio: 1.0 });
      expect(result).toBeNull();
    });

    it('handles single field update with correct param index', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.update(1, { sharpeRatio: 2.0 });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE id = $2');
      expect(params).toEqual([2.0, 1]);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('returns true when rowCount > 0', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const result = await repo.delete(1);
      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM marketplace_performance');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual([1]);
    });

    it('returns false when rowCount is 0', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const result = await repo.delete(999);
      expect(result).toBe(false);
    });

    it('returns false when rowCount is undefined', async () => {
      mockQuery.mockResolvedValueOnce({});
      const result = await repo.delete(1);
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
      expect(sql).toContain('WHERE tenant_id IS NULL');
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

    it('adds tenant_id IS NULL when tenantId not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 5 }] });
      await repo.count({ strategyId: 's1' });
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1 AND tenant_id IS NULL');
    });
  });

  // ─── getLatestByStrategy ───────────────────────────────────────────────────

  describe('getLatestByStrategy', () => {
    it('returns records ordered by date desc with default limit 30', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      const result = await repo.getLatestByStrategy('strat_001');
      expect(result).toEqual([PERFORMANCE]);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_performance');
      expect(sql).toContain('WHERE strategy_id = $1 AND tenant_id IS NULL');
      expect(sql).toContain('ORDER BY date DESC LIMIT $2');
      expect(params).toEqual(['strat_001', 30]);
    });

    it('uses custom limit when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [PERFORMANCE] });
      await repo.getLatestByStrategy('strat_001', 10);
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual(['strat_001', 10]);
    });

    it('returns empty array when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.getLatestByStrategy('nonexistent');
      expect(result).toEqual([]);
    });
  });
});
