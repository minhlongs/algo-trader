/**
 * Migration 039: Add tenant_id to audit_log for multi-tenant isolation.
 *
 * Adds nullable tenant_id column + composite index
 * (tenant_id, timestamp DESC) for fast per-tenant audit queries.
 */

import { PoolClient } from 'pg';

export const id = '039-audit-log-tenant';
export const description = 'Add tenant_id to audit_log with composite index';

export async function up(client: PoolClient): Promise<void> {
 await client.query(`
 ALTER TABLE audit_log
 ADD COLUMN IF NOT EXISTS tenant_id TEXT
 `);

 await client.query(`
 CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_timestamp
 ON audit_log (tenant_id, "timestamp" DESC)
 `);
}

export async function down(client: PoolClient): Promise<void> {
 await client.query('DROP INDEX IF EXISTS idx_audit_log_tenant_timestamp');
 await client.query('ALTER TABLE audit_log DROP COLUMN IF EXISTS tenant_id');
}
