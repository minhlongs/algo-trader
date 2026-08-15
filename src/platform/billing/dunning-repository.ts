/**
 * Dunning Repository
 *
 * Centralizes all SQL access for DunningService.
 * Extracted from dunning-service.ts to eliminate inline SQL.
 *
 * Pattern: singleton export with DbRow-compliant row interfaces.
 */

import { query } from '../../shared/db/postgres-client.js';
import type { DunningRecord, DunningStatus } from './dunning-service';

/* ── row types ─────────────────────────────────────────── */

interface DunningRow {
  [key: string]: string | number | boolean | Date | null | undefined;
  license_id: string;
  subscription_id: string | null;
  customer_email: string;
  retry_count: number;
  last_failure_date: string;
  first_failure_date: string;
  suspension_date: string | null;
  reinstatement_date: string | null;
  status: DunningStatus;
  created_at: string;
  updated_at: string;
}

/* ── SQL constants ─────────────────────────────────────── */

const SELECT_ALL = `SELECT license_id, subscription_id, customer_email,
  retry_count, last_failure_date, first_failure_date,
  suspension_date, reinstatement_date, status,
  created_at, updated_at FROM dunning_state`;

const UPSERT_SQL = `INSERT INTO dunning_state
  (license_id, subscription_id, customer_email, retry_count,
   last_failure_date, first_failure_date, suspension_date, reinstatement_date, status)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (license_id) DO UPDATE SET
  subscription_id = COALESCE(EXCLUDED.subscription_id, dunning_state.subscription_id),
  customer_email = EXCLUDED.customer_email,
  retry_count = EXCLUDED.retry_count,
  last_failure_date = EXCLUDED.last_failure_date,
  first_failure_date = COALESCE(dunning_state.first_failure_date, EXCLUDED.first_failure_date),
  suspension_date = EXCLUDED.suspension_date,
  reinstatement_date = EXCLUDED.reinstatement_date,
  status = EXCLUDED.status,
  updated_at = NOW()`;

/* ── repository class ──────────────────────────────────── */

export class DunningRepository {
  /**
   * Fetch all current dunning records from DB.
   */
  async getAllRecords(): Promise<DunningRecord[]> {
    const result = await query<DunningRow>(SELECT_ALL);
    return result.rows.map((row) => ({
      id: row.license_id,
      licenseId: row.license_id,
      subscriptionId: row.subscription_id ?? undefined,
      customerEmail: row.customer_email,
      retryCount: row.retry_count,
      lastAttemptDate: row.last_failure_date,
      firstFailureDate: row.first_failure_date,
      suspensionDate: row.suspension_date ?? undefined,
      reinstatementDate: row.reinstatement_date ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Insert or update a single dunning record.
   * lastAttemptDate param is required (caller must set it before calling).
   */
  async upsertRecord(record: DunningRecord): Promise<void> {
    await query(UPSERT_SQL, [
      record.licenseId,
      record.subscriptionId ?? null,
      record.customerEmail,
      record.retryCount,
      record.lastAttemptDate,
      record.firstFailureDate,
      record.suspensionDate ?? null,
      record.reinstatementDate ?? null,
      record.status,
    ]);
  }

  /**
   * Clear all dunning state (test convenience).
   */
  async clearAll(): Promise<void> {
    await query('TRUNCATE TABLE dunning_state');
  }
}

/* ── singleton export ──────────────────────────────────── */

export const dunningRepository = new DunningRepository();