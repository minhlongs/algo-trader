import { query } from '../../../shared/db/postgres-client';
import {
  IMarketplaceStrategy,
  PaginatedResult,
  PaginationParams,
  SortOrder,
} from '../models/types';

/** PostgreSQL query parameter types */
type SqlParam = string | number | boolean | null | string[];

export class StrategyRepository {
  private readonly TABLE = 'marketplace_strategies';

  async findById(id: string): Promise<IMarketplaceStrategy | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }

  async findAll(
    filters?: {
      tenantId?: string;
      creatorId?: string;
      status?: string;
      category?: string;
      search?: string;
    },
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceStrategy>> {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;

    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(filters.tenantId);
    }
    if (filters?.creatorId) {
      conditions.push(`creator_id = $${idx++}`);
      params.push(filters.creatorId);
    }
    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filters.category);
    }
    if (filters?.search) {
      conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortField = sort?.field || 'created_at';
    const sortOrder = sort?.order || 'desc';
    const orderBy = `ORDER BY ${sortField} ${sortOrder}`;

    const limit = pagination?.limit ?? 20;
    const page = pagination?.page ?? 1;
    const offset = (page - 1) * limit;

    const countSql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = parseInt(String(countResult.rows[0].total), 10);

    const dataSql = `SELECT * FROM ${this.TABLE} ${whereClause} ${orderBy} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const dataResult = await query(dataSql, params);

    return {
      data: dataResult.rows as unknown as IMarketplaceStrategy[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Partial<IMarketplaceStrategy>): Promise<IMarketplaceStrategy> {
    const sql = `
      INSERT INTO ${this.TABLE}
        (id, tenant_id, creator_id, name, description, category, status,
         risk_level, min_allocation_usd, max_allocation_usd, supported_exchanges,
         tags, backtest_summary, vetted_at, vetted_by, rejection_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    const params = [
      data.id,
      data.tenantId,
      data.creatorId,
      data.name,
      data.description,
      data.category,
      data.status ?? 'draft',
      data.riskLevel,
      data.minAllocationUsd,
      data.maxAllocationUsd,
      data.supportedExchanges ?? [],
      data.tags ?? [],
      data.backtestSummary ?? null,
      data.vettedAt ?? null,
      data.vettedBy ?? null,
      data.rejectionReason ?? null,
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceStrategy;
  }

  async update(
    id: string,
    data: Partial<IMarketplaceStrategy>,
  ): Promise<IMarketplaceStrategy | null> {
    const fields: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      tenantId: 'tenant_id',
      creatorId: 'creator_id',
      riskLevel: 'risk_level',
      minAllocationUsd: 'min_allocation_usd',
      maxAllocationUsd: 'max_allocation_usd',
      supportedExchanges: 'supported_exchanges',
      backtestSummary: 'backtest_summary',
      vettedAt: 'vetted_at',
      vettedBy: 'vetted_by',
      rejectionReason: 'rejection_reason',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if (data[key as keyof IMarketplaceStrategy] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        params.push((data as Record<string, unknown>)[key] as SqlParam);
      }
    }

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
    if (data.category !== undefined) { fields.push(`category = $${idx++}`); params.push(data.category); }
    if (data.status !== undefined) { fields.push(`status = $${idx++}`); params.push(data.status); }
    if (data.tags !== undefined) { fields.push(`tags = $${idx++}`); params.push(data.tags); }

    if (fields.length === 0) return this.findById(id);

    params.push(id);
    const sql = `UPDATE ${this.TABLE} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: { tenantId?: string; status?: string; category?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;

    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(filters.tenantId);
    }
    if (filters?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.category) {
      conditions.push(`category = $${idx++}`);
      params.push(filters.category);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }

  async updateStatus(id: string, status: string): Promise<IMarketplaceStrategy | null> {
    const sql = `UPDATE ${this.TABLE} SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const result = await query(sql, [status, id]);
    return (result.rows[0] as unknown as IMarketplaceStrategy) || null;
  }

  async findByStatus(status: string, filters?: { category?: string; creatorId?: string; limit?: number }): Promise<IMarketplaceStrategy[]> {
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
