/**
 * AI Audit migration 026: Governance and feature importance DDL queries (shared DB).
 * Tables: ai_model_governance, ai_feature_importance.
 */

import type { PoolClient } from 'pg';

export async function createAiAuditGovernanceTables(client: PoolClient): Promise<void> {
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
}
