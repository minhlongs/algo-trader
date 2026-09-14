/**
 * AI Audit migration 026: Materialized view and teardown DDL queries.
 * Views: mv_ai_model_performance.
 */

import type { PoolClient } from 'pg';

export async function createAiAuditViews(client: PoolClient): Promise<void> {
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
