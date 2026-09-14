/**
 * AI Audit migration 026: Materialized view and teardown DDL queries (shared DB).
 * Views: mv_ai_model_performance.
 */

import type { PoolClient } from 'pg';

export async function createAiAuditViews(client: PoolClient): Promise<void> {
  // ==================== mv_ai_model_performance (materialized view) ====================
  // Materialized view for quick model version comparison (refreshed periodically)
  await client.query(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ai_model_performance AS
    SELECT
      model_name,
      model_version,
      COUNT(*) as prediction_count,
      AVG(confidence) as avg_confidence,
      MAX(prediction_timestamp) as last_used,
      jsonb_object_agg(
        extract(epoch from date_trunc('day', prediction_timestamp)::date)::text,
        COUNT(*)
      ) as daily_usage
    FROM ai_predictions
    WHERE prediction_timestamp >= (now() - INTERVAL '90 days')
    GROUP BY model_name, model_version
    WITH DATA;

    CREATE INDEX IF NOT EXISTS idx_mv_ai_model_performance
      ON mv_ai_model_performance (model_name, last_used DESC);
  `);
}

export async function dropAiAuditTables(client: PoolClient): Promise<void> {
  // Drop in reverse order (FK dependencies)
  await client.query(`
    DROP MATERIALIZED VIEW IF EXISTS mv_ai_model_performance;
    DROP TABLE IF EXISTS ai_feature_importance CASCADE;
    DROP TABLE IF EXISTS ai_model_governance CASCADE;
    DROP TABLE IF EXISTS ai_explanations CASCADE;
    DROP TABLE IF EXISTS ai_predictions CASCADE;
  `);
}
