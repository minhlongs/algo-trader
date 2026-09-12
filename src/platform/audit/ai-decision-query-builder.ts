/**
 * SQL query building and row mapping helpers for AI decisions.
 */
import {
  type DbRow,
  type AIDecision,
  type AIDecisionMetadata,
  type DecisionFilters,
} from './ai-decision-types';

export function buildDecisionFilterConditions(
  filters: DecisionFilters,
): { sqlConditions: string; params: unknown[]; nextIdx: number } {
  let sqlConditions = '';
  const params: unknown[] = [];
  let idx = 1;

  if (filters.model_name) {
    sqlConditions += ` AND model_name = $${idx++}`;
    params.push(filters.model_name);
  }
  if (filters.start_date) {
    sqlConditions += ` AND created_at >= $${idx++}`;
    params.push(filters.start_date);
  }
  if (filters.end_date) {
    sqlConditions += ` AND created_at <= $${idx++}`;
    params.push(filters.end_date);
  }
  if (filters.min_confidence !== undefined) {
    sqlConditions += ` AND confidence >= $${idx++}`;
    params.push(filters.min_confidence);
  }
  if (filters.max_confidence !== undefined) {
    sqlConditions += ` AND confidence <= $${idx++}`;
    params.push(filters.max_confidence);
  }

  return { sqlConditions, params, nextIdx: idx };
}

export function mapDecisionRow(row: DbRow): AIDecision {
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

export function mapMetadataRow(row: DbRow): AIDecisionMetadata {
  return {
    id: row.id as string,
    decision_id: row.decision_id as string,
    key: row.key as string,
    value: row.value as string,
    created_at: row.created_at as string,
  };
}
