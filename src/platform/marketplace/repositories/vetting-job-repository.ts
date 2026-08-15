/**
 * Vetting Job Repository
 * Database operations for marketplace_vetting_history table
 */

import { query } from '../../../shared/db/postgres-client';
import type { PaginatedResult, PaginationParams, SortOrder } from '../models/types';

/** PostgreSQL query parameter types */
type SqlParam = string | number | boolean | null;

export interface VettingJobRecord {
  id: number;
  strategyId: string;
  adminId: string;
  decision: string;
  notes?: string;
  createdAt: Date;
}

export class VettingJobRepository {
  private readonly TABLE = 'marketplace_vetting_history';

  async findById(id: number): Promise<VettingJobRecord | null> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE id = $1`;
    const result = await query(sql, [id]);
    return (result.rows[0] as unknown as VettingJobRecord) || null;
  }

  async findByStrategyId(strategyId: string): Promise<VettingJobRecord[]> {
    const sql = `SELECT * FROM ${this.TABLE} WHERE strategy_id = $1 ORDER BY created_at DESC`;
    const result = await query(sql, [strategyId]);
    return result.rows as unknown as VettingJobRecord[];
  }

  async create(data: { strategyId: string; adminId: string; decision: string; notes?: string }): Promise<VettingJobRecord> {
    const sql = `INSERT INTO ${this.TABLE} (strategy_id, admin_id, decision, notes, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`;
    const result = await query(sql, [data.strategyId, data.adminId, data.decision, data.notes ?? null]);
    return result.rows[0] as unknown as VettingJobRecord;
  }

  async findAll(
    filters?: { strategyId?: string; decision?: string; adminId?: string },
    pagination?: PaginationParams,
    sort?: { field: string; order: SortOrder },
  ): Promise<PaginatedResult<VettingJobRecord>> {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.decision) { conditions.push(`decision = $${idx++}`); params.push(filters.decision); }
    if (filters?.adminId) { conditions.push(`admin_id = $${idx++}`); params.push(filters.adminId); }
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
      data: dataResult.rows as unknown as VettingJobRecord[],
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async count(filters?: { strategyId?: string; decision?: string }): Promise<number> {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    let idx = 1;
    if (filters?.strategyId) { conditions.push(`strategy_id = $${idx++}`); params.push(filters.strategyId); }
    if (filters?.decision) { conditions.push(`decision = $${idx++}`); params.push(filters.decision); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as total FROM ${this.TABLE} ${whereClause}`;
    const result = await query(sql, params);
    return parseInt(String(result.rows[0].total), 10);
  }

  async complete(id: number, result: { approved: boolean; score: number; feedback: string }): Promise<boolean> {
    const sql = `UPDATE ${this.TABLE} SET notes = COALESCE(notes, '') || $1 WHERE id = $2`;
    const suffix = `\n[Completed: approved=${result.approved}, score=${result.score}] ${result.feedback}`;
    const res = await query(sql, [suffix, id]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const vettingJobRepository = new VettingJobRepository();
