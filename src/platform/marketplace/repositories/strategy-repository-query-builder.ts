/**
 * Strategy Repository Query Builder
 *
 * Dynamic SQL query construction for marketplace strategy repository.
 */

import type {
  IMarketplaceStrategy,
  PaginationParams,
  SortOrder,
} from '../models/types';

/** PostgreSQL query parameter types */
export type SqlParam = string | number | boolean | null | string[] | undefined;

export interface StrategyFindFilters {
  tenantId?: string;
  creatorId?: string;
  status?: string;
  category?: string;
  search?: string;
}

export interface StrategyCountFilters {
  tenantId?: string;
  status?: string;
  category?: string;
}

export function buildStrategyFindAllQuery(
  table: string,
  filters?: StrategyFindFilters,
  pagination?: PaginationParams,
  sort?: { field: string; order: SortOrder },
): {
  countSql: string;
  countParams: SqlParam[];
  dataSql: string;
  dataParams: SqlParam[];
  limit: number;
  page: number;
} {
  const conditions: string[] = [];
  const params: SqlParam[] = [];
  let idx = 1;

  if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
  if (filters?.creatorId) { conditions.push(`creator_id = $${idx++}`); params.push(filters.creatorId); }
  if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
  if (filters?.category) { conditions.push(`category = $${idx++}`); params.push(filters.category); }
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

  const countSql = `SELECT COUNT(*) as total FROM ${table} ${whereClause}`;
  const countParams = [...params];

  const dataSql = `SELECT * FROM ${table} ${whereClause} ${orderBy} LIMIT $${idx++} OFFSET $${idx++}`;
  const dataParams = [...params, limit, offset];

  return { countSql, countParams, dataSql, dataParams, limit, page };
}

export function buildStrategyCreateQuery(
  table: string,
  data: Partial<IMarketplaceStrategy>,
): { sql: string; params: unknown[] } {
  const sql = `
    INSERT INTO ${table}
      (id, tenant_id, creator_id, name, description, category, status,
       risk_level, min_allocation_usd, max_allocation_usd, supported_exchanges,
       tags, backtest_summary, vetted_at, vetted_by, rejection_reason)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `;
  const params: unknown[] = [
    data.id, data.tenantId, data.creatorId, data.name, data.description,
    data.category, data.status ?? 'draft', data.riskLevel, data.minAllocationUsd,
    data.maxAllocationUsd, data.supportedExchanges ?? [], data.tags ?? [],
    data.backtestSummary ?? null, data.vettedAt ?? null, data.vettedBy ?? null,
    data.rejectionReason ?? null,
  ];
  return { sql, params };
}

export function buildStrategyUpdateQuery(
  table: string,
  id: string,
  data: Partial<IMarketplaceStrategy>,
): { sql: string; params: SqlParam[] } | null {
  const fields: string[] = [];
  const params: SqlParam[] = [];
  let idx = 1;

  const columnMap: Record<string, string> = {
    tenantId: 'tenant_id', creatorId: 'creator_id', riskLevel: 'risk_level',
    minAllocationUsd: 'min_allocation_usd', maxAllocationUsd: 'max_allocation_usd',
    supportedExchanges: 'supported_exchanges', backtestSummary: 'backtest_summary',
    vettedAt: 'vetted_at', vettedBy: 'vetted_by', rejectionReason: 'rejection_reason',
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

  if (fields.length === 0) return null;

  params.push(id);
  const sql = `UPDATE ${table} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
  return { sql, params };
}

export function buildStrategyCountQuery(
  table: string,
  filters?: StrategyCountFilters,
): { sql: string; params: SqlParam[] } {
  const conditions: string[] = [];
  const params: SqlParam[] = [];
  let idx = 1;

  if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
  if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
  if (filters?.category) { conditions.push(`category = $${idx++}`); params.push(filters.category); }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT COUNT(*) as total FROM ${table} ${whereClause}`;
  return { sql, params };
}
