/**
 * AI Decision Audit Repository
 * CRUD operations for ai_decisions and ai_decision_metadata tables
 *
 * Uses query() from postgres-client for direct SQL execution.
 */
import { query } from '../../shared/db/postgres-client';
import {
  type DbRow,
  type AIDecision,
  type AIDecisionMetadata,
  type AIDecisionWithMetadata,
  type RecordDecisionInput,
  type DecisionFilters,
} from './ai-decision-types';
import {
  buildDecisionFilterConditions,
  mapDecisionRow,
  mapMetadataRow,
} from './ai-decision-query-builder';

export {
  type AIDecision,
  type AIDecisionMetadata,
  type AIDecisionWithMetadata,
  type RecordDecisionInput,
  type DecisionFilters,
} from './ai-decision-types';

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
    const { sqlConditions, params, nextIdx } = buildDecisionFilterConditions(filters);
    sql += sqlConditions;
    let idx = nextIdx;

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
    const { sqlConditions, params } = buildDecisionFilterConditions(filters);
    sql += sqlConditions;

    const result = await query<DbRow>(sql, params);
    const total = result.rows[0].total;
    return typeof total === 'number' ? total : parseInt(total as string, 10) || 0;
  }

  // ──── Mappers ────

  private mapDecisionRow(row: DbRow): AIDecision {
    return mapDecisionRow(row);
  }

  private mapMetadataRow(row: DbRow): AIDecisionMetadata {
    return mapMetadataRow(row);
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
