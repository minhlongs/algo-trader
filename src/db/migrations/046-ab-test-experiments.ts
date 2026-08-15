/**
 * Migration 046: Create A/B Test Experiments Tables
 *
 * Supports controlled experiments for comparing fusion methods,
 * strategies, and model variants. Tracks group assignments and outcomes.
 */

import { PoolClient } from 'pg';

export const id = '046-ab-test-experiments';
export const description = 'Create ab_test_experiments and ab_test_outcomes tables';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ab_test_experiments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(128) NOT NULL UNIQUE,
      description TEXT,
      control_name VARCHAR(128) NOT NULL,
      treatment_name VARCHAR(128) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'running', 'paused', 'completed', 'archived')),
      traffic_pct NUMERIC(5, 2) NOT NULL DEFAULT 50.00
        CHECK (traffic_pct >= 0 AND traffic_pct <= 100),
      min_samples INTEGER NOT NULL DEFAULT 30,
      confidence_level NUMERIC(3, 2) NOT NULL DEFAULT 0.95,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ab_test_assignments (
      id SERIAL PRIMARY KEY,
      experiment_id INTEGER NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
      signal_id VARCHAR(128) NOT NULL,
      group_name VARCHAR(32) NOT NULL CHECK (group_name IN ('control', 'treatment')),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(experiment_id, signal_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ab_test_outcomes (
      id SERIAL PRIMARY KEY,
      experiment_id INTEGER NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
      signal_id VARCHAR(128) NOT NULL,
      group_name VARCHAR(32) NOT NULL CHECK (group_name IN ('control', 'treatment')),
      correct BOOLEAN NOT NULL,
      confidence NUMERIC(5, 4),
      pnl NUMERIC(20, 8) DEFAULT 0,
      metadata JSONB,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(experiment_id, signal_id)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ab_outcomes_experiment
    ON ab_test_outcomes (experiment_id, group_name)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ab_assignments_experiment
    ON ab_test_assignments (experiment_id, group_name)
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP INDEX IF EXISTS idx_ab_assignments_experiment');
  await client.query('DROP INDEX IF EXISTS idx_ab_outcomes_experiment');
  await client.query('DROP TABLE IF EXISTS ab_test_outcomes');
  await client.query('DROP TABLE IF EXISTS ab_test_assignments');
  await client.query('DROP TABLE IF EXISTS ab_test_experiments');
}
