/**
 * Migration 026: Create AI Decision Audit Trail Tables
 * Comprehensive audit trail for all AI/ML model predictions, explanations, and governance events
 *
 * Tables:
 * - ai_predictions: Immutable log of every AI model prediction with hash chaining
 * - ai_explanations: SHAP/LIME/LLM reasoning artifacts linked to predictions
 * - ai_model_governance: Model lifecycle events, training approvals, retraining justifications
 * - ai_feature_importance: Global feature importance per model version
 */

import { PoolClient } from 'pg';

export const id = '026-create-ai-audit-tables';
export const description = 'Create AI decision audit trail tables: predictions, explanations, governance, feature importance';

export async function up(client: PoolClient): Promise<void> {
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

  // ==================== ai_model_governance ====================
  // Model lifecycle events: training, deployment, retraining, approvals
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_model_governance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT,

      -- Model identification
      model_name VARCHAR(255) NOT NULL,
      model_version VARCHAR(100) NOT NULL,

      -- Governance event type
      event_type VARCHAR(50) NOT NULL CHECK (
        event_type IN (
          'training_requested', 'training_started', 'training_completed',
          'deployment_approved', 'deployed', 'retirement_requested',
          'retraining_justified', 'performance_degraded', 'drift_detected',
          'model_card_created', 'bias_audit_completed'
        )
      ),

      -- Event details
      event_data JSONB NOT NULL DEFAULT '{}',

      -- Training details (for training events)
      training_dataset_hash VARCHAR(64),
      training_metrics JSONB,  -- {accuracy, precision, recall, f1, mse, mae, ...}
      baseline_metrics JSONB,  -- Previous model metrics for comparison

      -- Approval workflow
      requested_by VARCHAR(255) NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      approved_by VARCHAR(255),
      approval_justification TEXT,
      approval_timestamp TIMESTAMPTZ,
      approval_metadata JSONB DEFAULT '{}',  -- e.g., risk assessment, compliance review

      -- Performance justification (for retraining)
      performance_regression DECIMAL(10,4),  -- Metric drop percentage
      drift_detected BOOLEAN DEFAULT FALSE,
      drift_metrics JSONB,  -- {data_drift: number, concept_drift: number, ...}

      -- Model artifact location
      model_artifact_path TEXT,  -- S3 or file path to saved model
      model_card_url TEXT,  -- Link to model card documentation

      -- Metadata
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      -- Composite unique constraint
      CONSTRAINT uq_ai_governance_model_version_event
        UNIQUE (model_name, model_version, event_type, created_at) DEFERRABLE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_ai_governance_model
      ON ai_model_governance (model_name, model_version, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_governance_tenant
      ON ai_model_governance (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_governance_event
      ON ai_model_governance (event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_governance_approval
      ON ai_model_governance (approved_by, approval_timestamp)
      WHERE approved_by IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ai_governance_requested
      ON ai_model_governance (requested_by, requested_at DESC);
  `);

  // ==================== ai_feature_importance ====================
  // Global feature importance per model version (SHAP values, permutation importance)
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_feature_importance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      model_name VARCHAR(255) NOT NULL,
      model_version VARCHAR(100) NOT NULL,

      -- Feature and importance
      feature_name VARCHAR(255) NOT NULL,
      importance_score DECIMAL(10,6) NOT NULL CHECK (importance_score >= 0 AND importance_score <= 1),

      -- Feature metadata
      feature_type VARCHAR(50),  -- 'numerical', 'categorical', 'binary', 'text'
      feature_description TEXT,
      feature_group VARCHAR(100),  -- e.g., 'technical_indicators', 'market_data', 'sentiment'

      -- Explanation method
      explanation_method VARCHAR(50) NOT NULL CHECK (
        explanation_method IN ('shap', 'lime', 'permutation', 'integrated_gradients', 'attention_weights')
      ),

      -- Statistical properties
      mean_contribution DECIMAL(10,6),
      std_deviation DECIMAL(10,6),
      min_contribution DECIMAL(10,6),
      max_contribution DECIMAL(10,6),

      -- Metadata
      calculation_metadata JSONB NOT NULL DEFAULT '{}',  -- How importance was computed (samples, method details)
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT uq_ai_feature_importance_model_feature_method
        UNIQUE (model_name, model_version, feature_name, explanation_method)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_ai_feature_importance_model
      ON ai_feature_importance (model_name, model_version, importance_score DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_feature_importance_group
      ON ai_feature_importance (feature_group, importance_score DESC) WHERE feature_group IS NOT NULL;
  `);

  // ==================== mv_ai_model_performance (materialized view) ====================
  // Materialized view for quick model version comparison (refreshed periodically).
  // NOTE: jsonb_object_agg cannot wrap COUNT(*) — Postgres rejects nested aggregates
  // (code 42803). Daily counts are pre-aggregated in a CTE, then folded into JSON.
  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ai_model_performance AS
    WITH daily_counts AS (
      SELECT
        model_name,
        model_version,
        date_trunc('day', prediction_timestamp)::date AS day,
        COUNT(*) AS cnt
      FROM ai_predictions
      WHERE prediction_timestamp >= (now() - INTERVAL '90 days')
      GROUP BY model_name, model_version, date_trunc('day', prediction_timestamp)
    )
    SELECT
      mc.model_name,
      mc.model_version,
      mc.prediction_count,
      mc.avg_confidence,
      mc.last_used,
      jsonb_object_agg(dc.day::text, dc.cnt) AS daily_usage
    FROM (
      SELECT
        model_name,
        model_version,
        COUNT(*) AS prediction_count,
        AVG(confidence) AS avg_confidence,
        MAX(prediction_timestamp) AS last_used
      FROM ai_predictions
      WHERE prediction_timestamp >= (now() - INTERVAL '90 days')
      GROUP BY model_name, model_version
    ) mc
    JOIN daily_counts dc
      ON dc.model_name = mc.model_name
     AND dc.model_version = mc.model_version
    GROUP BY mc.model_name, mc.model_version, mc.prediction_count, mc.avg_confidence, mc.last_used
    WITH DATA;

    CREATE INDEX IF NOT EXISTS idx_mv_ai_model_performance
      ON mv_ai_model_performance (model_name, last_used DESC);
  `);
}

export async function down(client: PoolClient): Promise<void> {
  // Drop in reverse order (FK dependencies)
  await client.query(`
    DROP MATERIALIZED VIEW IF EXISTS mv_ai_model_performance;
    DROP TABLE IF EXISTS ai_feature_importance CASCADE;
    DROP TABLE IF EXISTS ai_model_governance CASCADE;
    DROP TABLE IF EXISTS ai_explanations CASCADE;
    DROP TABLE IF EXISTS ai_predictions CASCADE;
  `);
}
