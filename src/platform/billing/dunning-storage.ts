import * as fs from 'fs';
import * as path from 'path';
import type { DunningRecord, DunningConfig } from './dunning-types';
import { getDbClient } from '../../shared/db/postgres-client';
import { logger } from '../../shared/utils/logger';

export const STORE_PATH = process.env.DUNNING_STORE_PATH
  || path.join(process.cwd(), 'data', 'dunning.json');

export function saveToFile(records: Map<string, DunningRecord>): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(Array.from(records.entries()), null, 2);
  fs.writeFileSync(STORE_PATH, data, { encoding: 'utf-8', mode: 0o600 });
}

export function loadFromFile(): Map<string, DunningRecord> {
  try {
    if (!fs.existsSync(STORE_PATH)) return new Map();
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const entries: [string, DunningRecord][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

export function loadDunningConfig(): DunningConfig {
  return {
    enabled: process.env.DUNNING_ENABLED !== 'false',
    maxRetries: parseInt(process.env.DUNNING_MAX_RETRIES || '3', 10),
    gracePeriodDays: parseInt(process.env.DUNNING_GRACE_PERIOD_DAYS || '7', 10),
  };
}

export function generateDunningId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function buildNewDunningRecord(
  licenseId: string,
  customerEmail: string,
  subscriptionId?: string,
): DunningRecord {
  const now = new Date().toISOString();
  return {
    id: `dun_${generateDunningId()}`,
    licenseId,
    subscriptionId,
    customerEmail,
    retryCount: 1,
    lastAttemptDate: now,
    firstFailureDate: now,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export async function seedDunningFromDb(): Promise<{ records: Map<string, DunningRecord>; ready: boolean }> {
  try {
    const pool = await getDbClient();
    const { rows } = await pool.query('SELECT * FROM dunning_state');
    const records = new Map<string, DunningRecord>();
    for (const row of rows) {
      const record: DunningRecord = {
        id: row.license_id,
        licenseId: row.license_id,
        subscriptionId: row.subscription_id,
        customerEmail: row.customer_email,
        retryCount: row.retry_count,
        lastAttemptDate: row.last_failure_date,
        firstFailureDate: row.first_failure_date,
        suspensionDate: row.suspension_date,
        reinstatementDate: row.reinstatement_date,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      records.set(record.licenseId, record);
    }
    return { records, ready: true };
  } catch {
    return { records: new Map(), ready: false };
  }
}

export async function upsertDunningToDb(record: DunningRecord): Promise<boolean> {
  try {
    const pool = await getDbClient();
    await pool.query(
      `INSERT INTO dunning_state
        (license_id, subscription_id, customer_email, retry_count,
         first_failure_date, last_failure_date, suspension_date,
         reinstatement_date, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (license_id) DO UPDATE SET
         subscription_id = EXCLUDED.subscription_id,
         customer_email = EXCLUDED.customer_email,
         retry_count = EXCLUDED.retry_count,
         last_failure_date = EXCLUDED.last_failure_date,
         suspension_date = EXCLUDED.suspension_date,
         reinstatement_date = EXCLUDED.reinstatement_date,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        record.licenseId,
        record.subscriptionId,
        record.customerEmail,
        record.retryCount,
        record.firstFailureDate,
        record.lastAttemptDate,
        record.suspensionDate,
        record.reinstatementDate,
        record.status,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return true;
  } catch (err) {
    logger.warn('[Dunning] DB upsert failed, falling back to file', { err: String(err) });
    return false;
  }
}
