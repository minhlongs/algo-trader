/**
 * AI Decision Audit Types & Interfaces
 */

// Local DbRow type to avoid import issues with mocked module
export interface DbRow {
  [key: string]: string | number | boolean | Date | null | undefined;
}

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
