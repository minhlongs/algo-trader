/**
 * Performance Repository
 * Database operations for marketplace_performance table
 */

import { query } from '../../shared/db/postgres-client';
import type { IMarketplacePerformance, PaginatedResult, PaginationParams, SortOrder } from '../models/types';

export interface PerformanceFilters {
  strategyId?: string;
  tenantId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export class PerformanceRepository {
  private readonly TABLE = 'marketplace_performance';

  async findById(id: number): Promise<IMarketplacePerformance | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplacePerformance) || null;
  }

  async findByStrategyAndDate(
    strategyId: string,
    date: Date,
    tenantId?: string,
  ): Promise<IMarketplacePerformance | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE strategy_id = $1 AND date = $2 AND (tenant_id = $3 OR tenant_id IS NULL) ORDER BY tenant_id NULLS LAST LIMIT 1`;
    const result = await query(sql, [strategyId, date.toISOString().split('T')[0], tenantId ?? null]);
    return (result.rows[0] as unknown as IMarketplacePerformance) || null;
  }

  async findAll(
    filters?: PerformanceFilters,
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplacePerformance>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    else { conditions.push(`tenant_id IS NULL`); }
    if (filters?.dateFrom) { conditions.push(`date >= $${idx++}`); params.push(filters.dateFrom); }
    if (filters?.dateTo) { conditions.push(`date <= $${idx++}`); params.push(filters.dateTo); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortField = sort?.field || 'date';
    const sortOrder = sort?.order || 'desc';
    const limit = pagination?.limit ?? 20;
    const page = pagination?.page ?? 1;
    const offset = (page - 1) * limit;

    const countSql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = parseInt(String(countResult.rows[0].total), 10);

    const dataSql = `SELECT * FROM ${this.TABLE} ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const dataResult = await query(dataSql, params);

    return {
      data: dataResult.rows as unknown as IMarketplacePerformance[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Partial<IMarketplacePerformance> & { strategyId: string; date: Date }): Promise<IMarketplacePerformance> {
    const sql = `INSERT INTO ${this.TABLE}
      (strategy_id, tenant_id, date, sharpe_ratio, max_drawdown, total_pnl_usd, win_rate, total_trades, winning_trades, losing_trades, avg_win_usd, avg_loss_usd, profit_factor, volatility, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()) RETURNING *`;
    const params = [
      data.strategyId, data.tenantId ?? null, data.date,
      data.sharpeRatio ?? null, data.maxDrawdown ?? null, data.totalPnlUsd ?? 0,
      data.winRate ?? null, data.totalTrades ?? 0, data.winningTrades ?? 0, data.losingTrades ?? 0,
      data.avgWinUsd ?? null, data.avgLossUsd ?? null, data.profitFactor ?? null, data.volatility ?? null,
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplacePerformance;
  }

  async upsert(data: Partial<IMarketplacePerformance> & { strategyId: string; date: Date }): Promise<IMarketplacePerformance> {
    const sql = `INSERT INTO ${this.TABLE}
      (strategy_id, tenant_id, date, sharpe_ratio, max_drawdown, total_pnl_usd, win_rate, total_trades, winning_trades, losing_trades, avg_win_usd, avg_loss_usd, profit_factor, volatility, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (strategy_id, tenant_id, date) DO UPDATE SET
      sharpe_ratio = EXCLUDED.sharpe_ratio, max_drawdown = EXCLUDED.max_drawdown,
      total_pnl_usd = EXCLUDED.total_pnl_usd, win_rate = EXCLUDED.win_rate,
      total_trades = EXCLUDED.total_trades, winning_trades = EXCLUDED.winning_trades,
      losing_trades = EXCLUDED.losing_trades, avg_win_usd = EXCLUDED.avg_win_usd,
      avg_loss_usd = EXCLUDED.avg_loss_usd, profit_factor = EXCLUDED.profit_factor,
      volatility = EXCLUDED.volatility, updated_at = NOW()`;
    const params = [
      data.strategyId, data.tenantId ?? null, data.date,
      data.sharpeRatio ?? null, data.maxDrawdown ?? null, data.totalPnlUsd ?? 0,
      data.winRate ?? null, data.totalTrades ?? 0, data.winningTrades ?? 0, data.losingTrades ?? 0,
      data.avgWinUsd ?? null, data.avgLossUsd ?? null, data.profitFactor ?? null, data.volatility ?? null,
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplacePerformance;
  }

  async update(id: number, data: Partial<IMarketplacePerformance>): Promise<IMarketplacePerformance | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      sharpeRatio: 'sharpe_ratio', maxDrawdown: 'max_drawdown', totalPnlUsd: 'total_pnl_usd',
      winRate: 'win_rate', totalTrades: 'total_trades', winningTrades: 'winning_trades',
      losingTrades: 'losing_trades', avgWinUsd: 'avg_win_usd', avgLossUsd: 'avg_loss_usd',
      profitFactor: 'profit_factor', volatility: 'volatility',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        params.push((data as Record<string, unknown>)[key]);
      }
    }

    if (fields.length === 0) return this.findById(id);
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const sql = `UPDATE ${this.TABLE} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return (result.rows[0] as unknown as IMarketplacePerformance) || null;
  }

  async delete(id: number): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: { strategyId?: string; tenantId?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    else { conditions.push(`tenant_id IS NULL`); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }

  async getLatestByStrategy(strategyId: string, limit = 30): Promise<IMarketplacePerformance[]> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE strategy_id = $1 AND tenant_id IS NULL ORDER BY date DESC LIMIT $2`;
    const result = await query(sql, [strategyId, limit]);
    return result.rows as unknown as IMarketplacePerformance[];
  }
}

export const performanceRepository = new PerformanceRepository();
