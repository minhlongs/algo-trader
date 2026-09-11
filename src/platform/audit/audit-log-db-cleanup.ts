/**
 * Audit Log DB Cleanup Operations.
 */

import { transaction } from '../../db/postgres-client.js';

export const CLEANUP_SQL = `
  DELETE FROM audit_log
  WHERE "timestamp" < $1
`;

export const COUNT_EXPIRED_SQL = `
  SELECT COUNT(*) AS cnt FROM audit_log WHERE "timestamp" < $1
`;

export async function executeGetExpiredLogIds(retentionDays: number): Promise<string[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISOString = cutoffDate.toISOString();
  const result = await transaction(async (client) => {
    await client.query("SET LOCAL audit.cleanup_allowed = 'on'");
    return client.query('SELECT id FROM audit_log WHERE "timestamp" < $1', [cutoffISOString]);
  });
  return result.rows.map((r) => r.id as string);
}

export async function executeCleanupExpiredLogs(retentionDays: number): Promise<{ removed: number; cutoffDate: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISOString = cutoffDate.toISOString();
  const result = await transaction(async (client) => {
    await client.query("SET LOCAL audit.cleanup_allowed = 'on'");
    return client.query(CLEANUP_SQL, [cutoffISOString]);
  });
  const removed = result.rowCount ?? 0;
  return { removed, cutoffDate: cutoffISOString };
}
