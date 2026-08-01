/**
 * Migration 040: Enforce audit_log immutability + permit retention cleanup
 *
 * - BEFORE UPDATE OR DELETE trigger raises an exception by default
 * - exempts cleanup when GUC `audit.cleanup_allowed` is set to 'on'
 *   (only the operator's cleanup job runs with this GUC set)
 */
import { PoolClient } from 'pg';

export const id = '040-audit-immutability';
export const description = 'audit_log immutable trigger + retention cleanup bypass';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION _audit_log_immutable()
    RETURNS TRIGGER AS $$
    BEGIN
      IF current_setting('audit.cleanup_allowed', true) <> 'on'
       AND (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'audit_log is immutable';
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
  `);

  await client.query(`
    CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION _audit_log_immutable();
  `);
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;');
  await client.query('DROP FUNCTION IF EXISTS _audit_log_immutable();');
}
