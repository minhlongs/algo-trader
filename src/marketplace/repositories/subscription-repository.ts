/**
 * Subscription Repository
 * Database operations for marketplace_subscriptions table
 */

import { query } from '../../db/postgres-client';
import type { IMarketplaceSubscription, PaginatedResult, PaginationParams, SortOrder } from '../models/types';

export interface SubscriptionFilters {
  tenantId?: string;
  strategyId?: string;
  listingId?: string;
  status?: string;
}

export class SubscriptionRepository {
  private readonly TABLE = 'marketplace_subscriptions';

  async findById(id: string): Promise<IMarketplaceSubscription | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceSubscription) || null;
  }

  async findAll(
    filters?: SubscriptionFilters,
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceSubscription>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.listingId) { conditions.push(`listing_id = $${idx++}`); params.push(filters.listingId); }
    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }

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
      data: dataResult.rows as unknown as IMarketplaceSubscription[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    id: string; tenantId: string; listingId: string; strategyId: string;
    allocationPercent: number; customRiskLimits?: Record<string, unknown>; currentInvestmentUsd: number;
  }): Promise<IMarketplaceSubscription> {
    const sql = `INSERT INTO ${this.TABLE}
      (id, tenant_id, listing_id, strategy_id, status, allocation_percent, custom_risk_limits, current_investment_usd, subscription_started_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, NOW(), NOW(), NOW()) RETURNING *`;
    const params = [
      data.id, data.tenantId, data.listingId, data.strategyId,
      data.allocationPercent,
      data.customRiskLimits ? JSON.stringify(data.customRiskLimits) : null,
      data.currentInvestmentUsd,
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceSubscription;
  }

  async update(id: string, data: Partial<IMarketplaceSubscription>): Promise<IMarketplaceSubscription | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      status: 'status', allocationPercent: 'allocation_percent',
      customRiskLimits: 'custom_risk_limits', currentInvestmentUsd: 'current_investment_usd',
      totalPnlUsd: 'total_pnl_usd',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        const val = (data as Record<string, unknown>)[key];
        params.push(key === 'customRiskLimits' ? JSON.stringify(val) : val);
      }
    }

    if (data.status === 'paused') fields.push(`paused_at = NOW()`);
    if (data.status === 'cancelled') fields.push(`cancelled_at = NOW()`);

    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const sql = `UPDATE ${this.TABLE} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return (result.rows[0] as unknown as IMarketplaceSubscription) || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: { tenantId?: string; strategyId?: string; status?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }

  async hasActiveSubscription(tenantId: string, strategyId: string): Promise<boolean> {
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} WHERE tenant_id = $1 AND strategy_id = $2 AND status = 'active'`;
    const result = await query(sql, [tenantId, strategyId]);
    return parseInt(String(result.rows[0].total), 10) > 0;
  }

  async findActiveByTenant(tenantId: string): Promise<IMarketplaceSubscription[]> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at DESC`;
    const result = await query(sql, [tenantId]);
    return result.rows as unknown as IMarketplaceSubscription[];
  }
}

export const subscriptionRepository = new SubscriptionRepository();
