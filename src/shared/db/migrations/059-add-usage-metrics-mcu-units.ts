/**
 * Migration 059: Add the MCU counter to usage_metrics
 *
 * MCU (Monetizable Compute Unit) used to be counted in an in-process `Map` inside
 * the desk `BillingMeter`, which meant the count reset every time the process
 * restarted: a tenant who had exhausted the allowance was unblocked by a restart,
 * and one who had barely used it stayed blocked after a reset. That is the same
 * failure class the API-call counter had, so it belongs on the same durable row
 * rather than in a second store.
 *
 * The column is separated from `calls_this_period` because the two units are not
 * interchangeable: an API call is one request, an MCU is one billed compute
 * operation, and a caller must never spend one against the other's allowance.
 */

import { PoolClient } from 'pg';

export const id = '059-add-usage-metrics-mcu-units';
export const description = 'Add the durable MCU counter to usage_metrics';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE usage_metrics
      ADD COLUMN IF NOT EXISTS mcu_this_period INTEGER NOT NULL DEFAULT 0
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE usage_metrics
      DROP COLUMN IF EXISTS mcu_this_period
  `);
}
