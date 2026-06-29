/**
 * AI Decision Audit Repository
 * CRUD operations for ai_decisions and ai_decision_metadata tables
 *
 * Uses query() from postgres-client for direct SQL execution.
 */

import { query } from '../../shared/db/postgres-client';

// Local DbRow type to avoid import issues with mocked module
interface DbRow {
  [key: string]: string | number | boolean | Date | null | undefined;
}

// ──── Types ────

export interface AIDecision {
  id: string;
  model_name: string;
  input_hash: string;
  output: Record<string, unknown>;
  confidence: number;
  latency_ms: number;
  created_at: string;
}

export interface AIDecisionMetadata {
  id: string;
  decision_id: string;
  key: string;
  value: string;
  created_at: string;
}

export interface AIDecisionWithMetadata extends AIDecision {
  metadata: AIDecisionMetadata[];
}

export interface RecordDecisionInput {
  model_name: string;
  input_hash: string;
  output: Record<string, unknown>;
  confidence: number;
  latency_ms: number;
}

export interface DecisionFilters {
  model_name?: string;
  start_date?: string;
  end_date?: string;
  min_confidence?: number;
  max_confidence?: number;
  limit?: number;
  offset?: number;
}

// ──── Repository ────

export class AIDecisionRepository {
  /**
   * INSERT INTO ai_decisions — record a new AI decision
   */
  async recordDecision(input: RecordDecisionInput): Promise<AIDecision> {
    const result = await query<DbRow>(
      `INSERT INTO ai_decisions (model_name, input_hash, output, confidence, latency_ms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, model_name, input_hash, output, confidence, latency_ms, created_at`,
      [
        input.model_name,
        input.input_hash,
        JSON.stringify(input.output),
        input.confidence,
        input.latency_ms,
      ]
    );

    return this.mapDecisionRow(result.rows[0]);
  }

  /**
   * INSERT INTO ai_decision_metadata — attach a key-value metadata entry to a decision
   */
  async recordMetadata(decisionId: string, key: string, value: string): Promise<AIDecisionMetadata> {
    const result = await query<DbRow>(
      `INSERT INTO ai_decision_metadata (decision_id, key, value)
       VALUES ($1, $2, $3)
       RETURNING id, decision_id, key, value, created_at`,
      [decisionId, key, value]
    );

    return this.mapMetadataRow(result.rows[0]);
  }

  /**
   * Query ai_decisions with optional filters
   * Supports: model_name, date range (start_date/end_date), confidence range (min/max), pagination
   */
  async getDecisions(filters: DecisionFilters = {}): Promise<AIDecision[]> {
    let sql = `
      SELECT id, model_name, input_hash, output, confidence, latency_ms, created_at
      FROM ai_decisions
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (filters.model_name) {
      sql += ` AND model_name = $${idx++}`;
      params.push(filters.model_name);
    }
    if (filters.start_date) {
      sql += ` AND created_at >= $${idx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ` AND created_at <= $${idx++}`;
      params.push(filters.end_date);
    }
    if (filters.min_confidence !== undefined) {
      sql += ` AND confidence >= $${idx++}`;
      params.push(filters.min_confidence);
    }
    if (filters.max_confidence !== undefined) {
      sql += ` AND confidence <= $${idx++}`;
      params.push(filters.max_confidence);
    }

    sql += ` ORDER BY created_at DESC`;

    if (filters.limit) {
      sql += ` LIMIT $${idx++}`;
      params.push(filters.limit);
    }
    if (filters.offset !== undefined) {
      sql += ` OFFSET $${idx++}`;
      params.push(filters.offset);
    }

    const result = await query<DbRow>(sql, params);
    return result.rows.map((row) => this.mapDecisionRow(row));
  }

  /**
   * Get a single decision by ID with all its metadata entries
   */
  async getDecisionWithMetadata(decisionId: string): Promise<AIDecisionWithMetadata | null> {
    const decisionResult = await query<DbRow>(
      `SELECT id, model_name, input_hash, output, confidence, latency_ms, created_at
       FROM ai_decisions
       WHERE id = $1`,
      [decisionId]
    );

    if (decisionResult.rows.length === 0) {
      return null;
    }

    const decision = this.mapDecisionRow(decisionResult.rows[0]);

    const metadataResult = await query<DbRow>(
      `SELECT id, decision_id, key, value, created_at
       FROM ai_decision_metadata
       WHERE decision_id = $1
       ORDER BY key ASC`,
      [decisionId]
    );

    return {
      ...decision,
      metadata: metadataResult.rows.map((row) => this.mapMetadataRow(row)),
    };
  }

  /**
   * Count total decisions matching filters (for pagination)
   */
  async countDecisions(filters: Omit<DecisionFilters, 'limit' | 'offset'> = {}): Promise<number> {
    let sql = `SELECT COUNT(*) as total FROM ai_decisions WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;

    if (filters.model_name) {
      sql += ` AND model_name = $${idx++}`;
      params.push(filters.model_name);
    }
    if (filters.start_date) {
      sql += ` AND created_at >= $${idx++}`;
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      sql += ` AND created_at <= $${idx++}`;
      params.push(filters.end_date);
    }
    if (filters.min_confidence !== undefined) {
      sql += ` AND confidence >= $${idx++}`;
      params.push(filters.min_confidence);
    }
    if (filters.max_confidence !== undefined) {
      sql += ` AND confidence <= $${idx++}`;
      params.push(filters.max_confidence);
    }

    const result = await query<DbRow>(sql, params);
    const total = result.rows[0].total;
    return typeof total === 'number' ? total : parseInt(total as string, 10) || 0;
  }

  // ──── Mappers ────

  private mapDecisionRow(row: DbRow): AIDecision {
    return {
      id: row.id as string,
      model_name: row.model_name as string,
      input_hash: row.input_hash as string,
      output: (row.output as string) ? JSON.parse(row.output as string) : {},
      confidence: parseFloat(row.confidence as string),
      latency_ms: parseInt(row.latency_ms as string, 10),
      created_at: row.created_at as string,
    };
  }

  private mapMetadataRow(row: DbRow): AIDecisionMetadata {
    return {
      id: row.id as string,
      decision_id: row.decision_id as string,
      key: row.key as string,
      value: row.value as string,
      created_at: row.created_at as string,
    };
  }
}

// Singleton
let instance: AIDecisionRepository | null = null;

export function getAIDecisionRepository(): AIDecisionRepository {
  if (!instance) {
    instance = new AIDecisionRepository();
  }
  return instance;
}
