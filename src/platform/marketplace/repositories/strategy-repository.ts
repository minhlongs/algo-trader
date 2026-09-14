import { query } from '../../../shared/db/postgres-client';
import type {
  IMarketplaceStrategy,
  PaginatedResult,
  PaginationParams,
  SortOrder,
} from '../models/types';
import {
  type SqlParam,
  type StrategyFindFilters,
  type StrategyCountFilters,
  buildStrategyFindAllQuery,
  buildStrategyCreateQuery,
  buildStrategyUpdateQuery,
  buildStrategyCountQuery,
} from './strategy-repository-query-builder';

// Re-export query builder utilities and types for 100% backward compatibility
export type { SqlParam, StrategyFindFilters, StrategyCountFilters };
export {
  buildStrategyFindAllQuery,
  buildStrategyCreateQuery,
  buildStrategyUpdateQuery,
  buildStrategyCountQuery,
};

export class StrategyRepository {
  private readonly TABLE = 'marketplace_strategies';

  async findById(id: string): Promise<IMarketplaceStrategy | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }

  async findAll(
    filters?: StrategyFindFilters,
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceStrategy>> {
    const { countSql, countParams, dataSql, dataParams, limit, page } =
      buildStrategyFindAllQuery(this.TABLE, filters, pagination, sort);

    const countResult = await query(countSql, countParams);
    const total = parseInt(String(countResult.rows[0].total), 10);

    const dataResult = await query(dataSql, dataParams);

    return {
      data: dataResult.rows as unknown as IMarketplaceStrategy[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Partial<IMarketplaceStrategy>): Promise<IMarketplaceStrategy> {
    const { sql, params } = buildStrategyCreateQuery(this.TABLE, data);
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceStrategy;
  }

  async update(
    id: string,
    data: Partial<IMarketplaceStrategy>,
  ): Promise<IMarketplaceStrategy | null> {
    const updateQuery = buildStrategyUpdateQuery(this.TABLE, id, data);
    if (!updateQuery) return this.findById(id);

    const result = await query(updateQuery.sql, updateQuery.params);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: StrategyCountFilters): Promise<number> {
    const { sql, params } = buildStrategyCountQuery(this.TABLE, filters);
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }

  async updateStatus(id: string, status: string): Promise<IMarketplaceStrategy | null> {
    const sql = `UPDATE ${this.TABLE} SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const result = await query(sql, [status, id]);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }

  async findByStatus(
    status: string,
    filters?: { category?: string; creatorId?: string; limit?: number },
  ): Promise<IMarketplaceStrategy[]> {
    const conditions: string[] = [`status = $1`];
    const params: SqlParam[] = [status];
    let idx = 2;
    if (filters?.category) { conditions.push(`category = $${idx++}`); params.push(filters.category); }
    if (filters?.creatorId) { conditions.push(`creator_id = $${idx++}`); params.push(filters.creatorId); }
    const limit = filters?.limit ?? 50;
    const sql = `SELECT * FROM ${this.TABLE} WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);
    const result = await query(sql, params);
    return result.rows as unknown as IMarketplaceStrategy[];
  }

  async findLatestPerformance(strategyId: string): Promise<IMarketplaceStrategy | null> {
    const sql = `SELECT * FROM marketplace_performance WHERE strategy_id = $1 AND tenant_id IS NULL ORDER BY date DESC LIMIT 1`;
    const result = await query(sql, [strategyId]);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }
}

export const strategyRepository = new StrategyRepository();
