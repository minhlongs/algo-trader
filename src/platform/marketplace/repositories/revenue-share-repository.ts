/**
 * Revenue Share Repository
 * Database operations for marketplace_revenue_shares table
 */

import { query } from '../../../shared/db/postgres-client';
import type { IMarketplaceRevenueShare, RevenueShareStatus, PaginatedResult, PaginationParams, SortOrder } from '../models/types';

export interface RevenueShareFilters {
  strategyId?: string;
  tenantId?: string;
  subscriptionId?: string;
  status?: RevenueShareStatus;
  periodStart?: Date;
  periodEnd?: Date;
}

export class RevenueShareRepository {
  private readonly TABLE = 'marketplace_revenue_shares';

  async findById(id: string): Promise<IMarketplaceRevenueShare | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceRevenueShare) || null;
  }

  async findAll(
    filters?: RevenueShareFilters,
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceRevenueShare>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.subscriptionId) { conditions.push(`subscription_id = $${idx++}`); params.push(filters.subscriptionId); }
    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.periodStart) { conditions.push(`period_start >= $${idx++}`); params.push(filters.periodStart); }
    if (filters?.periodEnd) { conditions.push(`period_end <= $${idx++}`); params.push(filters.periodEnd); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortField = sort?.field || 'period_start';
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
      data: dataResult.rows as unknown as IMarketplaceRevenueShare[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    id: string; strategyId: string; tenantId: string; subscriptionId: string;
    periodStart: Date; periodEnd: Date;
    grossRevenueCents: number; platformShareCents: number; creatorShareCents: number;
    status?: RevenueShareStatus;
  }): Promise<IMarketplaceRevenueShare> {
    const sql = `INSERT INTO ${this.TABLE}
      (id, strategy_id, tenant_id, subscription_id, period_start, period_end, gross_revenue_cents, platform_share_cents, creator_share_cents, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`;
    const params = [
      data.id, data.strategyId, data.tenantId, data.subscriptionId,
      data.periodStart, data.periodEnd,
      data.grossRevenueCents, data.platformShareCents, data.creatorShareCents,
      data.status ?? 'pending',
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceRevenueShare;
  }

  async update(id: string, data: Partial<IMarketplaceRevenueShare>): Promise<IMarketplaceRevenueShare | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      status: 'status', paidAt: 'paid_at', stripePayoutId: 'stripe_payout_id',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        params.push((data as Record<string, unknown>)[key]);
      }
    }

    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const sql = `UPDATE ${this.TABLE} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return (result.rows[0] as unknown as IMarketplaceRevenueShare) || null;
  }

  async markAsPaid(id: string, stripePayoutId?: string): Promise<IMarketplaceRevenueShare | null> {
    const sql = `UPDATE ${this.TABLE} SET status = 'paid', paid_at = NOW(), stripe_payout_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const result = await query(sql, [stripePayoutId ?? null, id]);
    return (result.rows[0] as unknown as IMarketplaceRevenueShare) || null;
  }

  async findByPeriod(strategyId: string, periodStart: Date, periodEnd: Date): Promise<IMarketplaceRevenueShare | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE strategy_id = $1 AND period_start = $2 AND period_end = $3 LIMIT 1`;
    const result = await query(sql, [strategyId, periodStart, periodEnd]);
    return (result.rows[0] as unknown as IMarketplaceRevenueShare) || null;
  }

  async getCreatorTotals(tenantId: string): Promise<{ totalRevenue: number; totalPayouts: number; pending: number }> {
    const sql = `
      SELECT
        COALESCE(SUM(creator_share_cents), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN creator_share_cents ELSE 0 END), 0) as total_payouts,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN creator_share_cents ELSE 0 END), 0) as pending
      FROM ${this.TABLE} WHERE tenant_id = $1`;
    const result = await query(sql, [tenantId]);
    const row = result.rows[0];
    return {
      totalRevenue: parseInt(String(row.total_revenue), 10),
      totalPayouts: parseInt(String(row.total_payouts), 10),
      pending: parseInt(String(row.pending), 10),
    };
  }

  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: { strategyId?: string; tenantId?: string; status?: RevenueShareStatus }): Promise<number> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }
}

export const revenueShareRepository = new RevenueShareRepository();
