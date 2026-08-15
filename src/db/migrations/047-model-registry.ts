/**
 * Migration 047: Create Model Registry Table
 *
 * Tracks versioned ML model artifacts with metrics, training data hashes,
 * and deployment status. Enables model comparison and rollback.
 */

import { PoolClient } from 'pg';

export const id = '047-model-registry';
export const description = 'Create model_registry table for ML model versioning';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS model_registry (
      id SERIAL PRIMARY KEY,
      model_name VARCHAR(128) NOT NULL,
      version VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'registered'
        CHECK (status IN ('registered', 'staging', 'production', 'archived', 'failed')),
      description TEXT,
      metrics JSONB DEFAULT '{}',
      training_data_hash VARCHAR(128),
      artifact_path TEXT,
      hyperparameters JSONB DEFAULT '{}',
      model_type VARCHAR(64),
      registered_by VARCHAR(128),
      promoted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(model_name, version)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_model_registry_name
    ON model_registry (model_name, created_at DESC)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_model_registry_status
    ON model_registry (status)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_model_registry_status');
  await client.query('DROP INDEX IF EXISTS idx_model_registry_name');
  await client.query('DROP TABLE IF EXISTS model_registry');
}
