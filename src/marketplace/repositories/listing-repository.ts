/**
 * Listing Repository
 * Database operations for marketplace_listings table
 */

import { query } from '../../db/postgres-client';
import type { IMarketplaceListing, PaginatedResult, PaginationParams, SortOrder } from '../models/types';

export class ListingRepository {
  private readonly TABLE = 'marketplace_listings';

  async findById(id: string): Promise<IMarketplaceListing | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceListing) || null;
  }

  async findByStrategyId(strategyId: string): Promise<IMarketplaceListing | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE strategy_id = $1`;
    const result = await query(sql, [strategyId]);
    return (result.rows[0] as unknown as IMarketplaceListing) || null;
  }

  async findAll(
    filters?: { strategyId?: string; tenantId?: string; isActive?: boolean },
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceListing>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.isActive !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(filters.isActive); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortField = sort?.field || 'created_at';
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
      data: dataResult.rows as unknown as IMarketplaceListing[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    id: string; strategyId: string; tenantId: string;
    priceUsdMonthly: number; billingCycle: string;
    riskLimits: Record<string, unknown>;
    allowedTenants?: string[]; excludedTenants?: string[];
    isActive: boolean;
  }): Promise<IMarketplaceListing> {
    const sql = `INSERT INTO ${this.TABLE}
      (id, strategy_id, tenant_id, price_usd_monthly, billing_cycle, risk_limits, allowed_tenants, excluded_tenants, is_active, subscriber_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NOW(), NOW()) RETURNING *`;
    const params = [
      data.id, data.strategyId, data.tenantId, data.priceUsdMonthly,
      data.billingCycle, JSON.stringify(data.riskLimits),
      data.allowedTenants ?? [], data.excludedTenants ?? [], data.isActive,
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceListing;
  }

  async update(id: string, data: Partial<IMarketplaceListing>): Promise<IMarketplaceListing | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      priceUsdMonthly: 'price_usd_monthly', billingCycle: 'billing_cycle',
      riskLimits: 'risk_limits', allowedTenants: 'allowed_tenants',
      excludedTenants: 'excluded_tenants', isActive: 'is_active',
      subscriberCount: 'subscriber_count',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        const val = (data as Record<string, unknown>)[key];
        params.push(key === 'riskLimits' ? JSON.stringify(val) : val);
      }
    }

    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const sql = `UPDATE ${this.TABLE} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return (result.rows[0] as unknown as IMarketplaceListing) || null;
  }

  async incrementSubscriberCount(id: string, delta = 1): Promise<void> {
    const sql = `UPDATE ${this.TABLE} SET subscriber_count = subscriber_count + $1, updated_at = NOW() WHERE id = $2`;
    await query(sql, [delta, id]);
  }

  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: { isActive?: boolean; strategyId?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.isActive !== undefined) { conditions.push(`is_active = $${idx++}`); params.push(filters.isActive); }
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }
}

export const listingRepository = new ListingRepository();
