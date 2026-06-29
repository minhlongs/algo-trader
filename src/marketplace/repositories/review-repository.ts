/**
 * Review Repository
 * Database operations for marketplace_reviews table
 */

import { query } from '../../shared/db/postgres-client';
import type { IMarketplaceReview, PaginatedResult, PaginationParams, SortOrder } from '../models/types';

export interface ReviewFilters {
  strategyId?: string;
  tenantId?: string;
  isFlagged?: boolean;
  minRating?: number;
}

export class ReviewRepository {
  private readonly TABLE = 'marketplace_reviews';

  async findById(id: string): Promise<IMarketplaceReview | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as IMarketplaceReview) || null;
  }

  async findAll(
    filters?: ReviewFilters,
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<IMarketplaceReview>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(filters.tenantId); }
    if (filters?.isFlagged !== undefined) { conditions.push(`is_flagged = $${idx++}`); params.push(filters.isFlagged); }
    if (filters?.minRating) { conditions.push(`rating >= $${idx++}`); params.push(filters.minRating); }

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
      data: dataResult.rows as unknown as IMarketplaceReview[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    id: string; tenantId: string; strategyId: string; subscriptionId: string;
    rating: number; comment: string; isVerified: boolean;
  }): Promise<IMarketplaceReview> {
    const sql = `INSERT INTO ${this.TABLE}
      (id, tenant_id, strategy_id, subscription_id, rating, comment, is_verified, helpful_votes, reported_count, is_flagged, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, false, NOW(), NOW()) RETURNING *`;
    const params = [
      data.id, data.tenantId, data.strategyId, data.subscriptionId,
      data.rating, data.comment, data.isVerified,
    ];
    const result = await query(sql, params);
    return result.rows[0] as unknown as IMarketplaceReview;
  }

  async update(id: string, data: Partial<IMarketplaceReview>): Promise<IMarketplaceReview | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const columnMap: Record<string, string> = {
      rating: 'rating', comment: 'comment', isVerified: 'is_verified',
      helpfulVotes: 'helpful_votes', reportedCount: 'reported_count', isFlagged: 'is_flagged',
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
    return (result.rows[0] as unknown as IMarketplaceReview) || null;
  }

  async incrementHelpful(id: string): Promise<void> {
    const sql = `UPDATE ${this.TABLE} SET helpful_votes = helpful_votes + 1, updated_at = NOW() WHERE id = $1`;
    await query(sql, [id]);
  }

  async incrementReported(id: string): Promise<void> {
    const sql = `UPDATE ${this.TABLE} SET reported_count = reported_count + 1, updated_at = NOW() WHERE id = $1`;
    await query(sql, [id]);
  }

  async findBySubscriptionId(subscriptionId: string): Promise<IMarketplaceReview | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE subscription_id = $1`;
    const result = await query(sql, [subscriptionId]);
    return (result.rows[0] as unknown as IMarketplaceReview) || null;
  }

  async delete(id: string): Promise<boolean> {
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
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }

  async getAverageRating(strategyId: string): Promise<{ avg: number; count: number }> {
    const sql = `SELECT AVG(rating)::numeric(3,2) as avg, COUNT(*) as count FROM ${this.TABLE} WHERE strategy_id = $1 AND is_flagged = false`;
    const result = await query(sql, [strategyId]);
    const row = result.rows[0];
    return { avg: parseFloat(String(row?.avg || '0')), count: parseInt(String(row?.count || '0'), 10) };
  }
}

export const reviewRepository = new ReviewRepository();
