/**
 * AI Audit migration 026: Core table DDL queries.
 * Tables: ai_predictions, ai_explanations.
 */

import type { PoolClient } from 'pg';

export async function createAiAuditCoreTables(client: PoolClient): Promise<void> {
  // ==================== ai_predictions ====================
  // Immutable log of every AI model prediction with hash chaining for tamper detection
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_predictions (
      -- Primary key and identifiers
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL,
      sequence_number BIGINT NOT NULL,

      -- Prediction metadata
      prediction_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
      model_name VARCHAR(255) NOT NULL,
      model_version VARCHAR(100) NOT NULL,
      model_type VARCHAR(100) NOT NULL CHECK (model_type IN ('gru', 'llm', 'ensemble', 'rule_based', 'custom')),

      -- Input features (serialized)
      input_features JSONB NOT NULL DEFAULT '{}',

      -- Prediction output
      prediction_result JSONB NOT NULL DEFAULT '{}',
      confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

      -- Context
      market_id TEXT,
      strategy VARCHAR(100),
      wallet_label TEXT,

      -- Hash chain for immutability (like tenant_audit_logs)
      hash VARCHAR(64) NOT NULL,
      previous_hash VARCHAR(64),

      -- Metadata
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      -- Constraints
      CONSTRAINT uq_ai_predictions_tenant_sequence UNIQUE (tenant_id, sequence_number)
    );

    -- Indexes for query patterns
    CREATE INDEX IF NOT EXISTS idx_ai_predictions_tenant_created
      ON ai_predictions (tenant_id, prediction_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_predictions_model
      ON ai_predictions (model_name, model_version);
    CREATE INDEX IF NOT EXISTS idx_ai_predictions_market
      ON ai_predictions (market_id) WHERE market_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_predictions_hash
      ON ai_predictions (hash);
    CREATE INDEX IF NOT EXISTS idx_ai_predictions_created
      ON ai_predictions (created_at DESC);
  `);

  // ==================== ai_explanations ====================
  // Explanation artifacts: SHAP, LIME, LLM reasoning, feature contributions
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_explanations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prediction_id UUID NOT NULL REFERENCES ai_predictions(id) ON DELETE CASCADE,

      -- Explanation type
      explanation_type VARCHAR(50) NOT NULL CHECK (
        explanation_type IN ('shap', 'lime', 'llm_reasoning', 'feature_importance', 'counterfactual', 'rule_extraction')
      ),

      -- Explanation data
      explanation_data JSONB NOT NULL DEFAULT '{}',
      feature_contributions JSONB,  -- {feature_name: contribution_score}
      top_features JSONB,  -- Array of {feature: string, contribution: number, rank: number}

      -- Text explanations (for LLM outputs)
      reasoning_text TEXT,
      risk_factors TEXT[],  -- Array of identified risks
      decision_rationale TEXT,  -- Why this decision was made

      -- Metadata
      explanation_metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT uq_ai_explanations_prediction_type
        UNIQUE (prediction_id, explanation_type)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_ai_explanations_prediction
      ON ai_explanations (prediction_id);
    CREATE INDEX IF NOT EXISTS idx_ai_explanations_type
      ON ai_explanations (explanation_type);
  `);
}
