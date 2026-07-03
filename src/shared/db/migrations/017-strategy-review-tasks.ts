/**
 * Migration 017: Strategy review tasks queue
 * Soft upstream signal for human-review when Qwen quality drifts
 */

import { PoolClient } from 'pg';

export const id = '017-strategy-review-tasks';
export const description = 'Create strategy review tasks queue';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS strategy_review_tasks (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      source         TEXT        NOT NULL,
      trigger_reason TEXT        NOT NULL,
      metrics        JSONB       NOT NULL,
      status         TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'acknowledged', 'resolved')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at    TIMESTAMPTZ
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_strategy_review_tasks_source_status ON strategy_review_tasks (source, status, created_at DESC)');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uniq_strategy_review_tasks_daily ON strategy_review_tasks (source, trigger_reason, ((created_at AT TIME ZONE \'UTC\')::date))');
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS strategy_review_tasks CASCADE');
}
