/**
 * Dispute Repository
 * Database operations for marketplace_disputes table
 */

import { query } from '../../../shared/db/postgres-client';
import type { IMarketplaceDispute, PaginatedResult, PaginationParams, SortOrder } from '../models/types';

/** PostgreSQL query parameter types */
type SqlParam = string | number | boolean | null;

export interface DisputeFilters {
  tenantId?: string;
  listingId?: string;
  subscriptionId?: string;
  status?: string;
  reason?: string;
}

export class DisputeRepository {
  private readonly TABLE = 'marketplace_disputes';

  async findById(id: string): Promise<IMarketplaceDispute | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceDispute) || null;
  }

  async findAll(
    filters?: DisputeFilters,
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceDispute>> {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;

    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.listingId) { conditions.push(`listing_id = $${idx++}`); params.push(filters.listingId); }
    if (filters?.subscriptionId) { conditions.push(`subscription_id = $${idx++}`); params.push(filters.subscriptionId); }
    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.reason) { conditions.push(`reason = $${idx++}`); params.push(filters.reason); }

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
      data: dataResult.rows as unknown as IMarketplaceDispute[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    id: string; tenantId: string; listingId: string; subscriptionId: string;
    reason: string; description: string; evidenceUrls?: string[];
  }): Promise<IMarketplaceDispute> {
    const sql = `INSERT INTO ${this.TABLE}
      (id, tenant_id, listing_id, subscription_id, reason, description, evidence_urls, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW()) RETURNING *`;
    const params = [
      data.id, data.tenantId, data.listingId, data.subscriptionId,
      data.reason, data.description,
      data.evidenceUrls ?? [],
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceDispute;
  }

  async update(id: string, data: Partial<IMarketplaceDispute>): Promise<IMarketplaceDispute | null> {
    const fields: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      status: 'status', resolution: 'resolution', resolvedBy: 'resolved_by',
      resolvedAt: 'resolved_at', compensationAmountCents: 'compensation_amount_cents',
      compensationType: 'compensation_type', adminNotes: 'admin_notes',
    };

    for (const [key, column] of Object.entries(columnMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        fields.push(`${column} = $${idx++}`);
        params.push((data as Record<string, unknown>)[key] as SqlParam);
      }
    }

    if (fields.length === 0) return this.findById(id);
    params.push(id);
    const sql = `UPDATE ${this.TABLE} SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, params);
    return (result.rows[0] as unknown as IMarketplaceDispute) || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = `DELETE FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async count(filters?: { tenantId?: string; status?: string; listingId?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
    if (filters?.listingId) { conditions.push(`listing_id = $${idx++}`); params.push(filters.listingId); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }
}

export const disputeRepository = new DisputeRepository();
