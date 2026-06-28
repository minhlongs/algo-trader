/**
 * Migration: Backfill Referral Codes for Existing Tenants
 * Generates unique referral codes for all tenants that don't have one
 */

import { getDbClient } from '../postgres-client';
import { logger } from '../../utils/logger';

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function backfillReferralCodes(): Promise<void> {
  const pool = getDbClient();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get all tenant IDs from tenant_credentials that don't have a referral code
    const result = await client.query<{ subscriber_id: string }>(
      `SELECT subscriber_id FROM tenant_credentials WHERE referral_code IS NULL OR referral_code = ''`
    );

    const tenants = result.rows;
    const total = tenants.length;
    logger.info(`[Backfill] Found ${total} tenants without referral codes`);

    let updated = 0;
    let retries = 0;
    const maxRetries = 3;

    for (const row of tenants) {
      let attempts = 0;
      let code: string;
      let isUnique = false;

      while (attempts < maxRetries && !isUnique) {
        code = generateReferralCode();

        // Check if code already exists
        const checkResult = await client.query<{ count: number }>(
          `SELECT COUNT(*) as count FROM referral_codes WHERE code = $1`,
          [code]
        );

        if (checkResult.rows[0].count === 0) {
          // Code is unique, insert it
          try {
            await client.query(
              `INSERT INTO referral_codes (code, tenant_id, is_active, used_count) VALUES ($1, $2, true, 0)`,
              [code, row.subscriber_id]
            );

            // Update tenant_credentials with the referral code
            await client.query(
              `UPDATE tenant_credentials SET referral_code = $1, updated_at = NOW() WHERE subscriber_id = $2`,
              [code, row.subscriber_id]
            );

            updated++;
            isUnique = true;
          } catch (err) {
            if ((err as Error).message.includes('unique constraint')) {
              retries++;
              attempts++;
              continue; // Try again
            }
            throw err;
          }
        } else {
          attempts++;
          retries++;
        }
      }

      if (!isUnique) {
        logger.warn(`[Backfill] Failed to generate unique code for tenant ${row.subscriber_id} after ${maxRetries} attempts`);
      }
    }

    await client.query('COMMIT');
    logger.info(`[Backfill] Completed: ${updated}/${total} tenants updated, ${retries} retries due to collisions`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[Backfill] Failed:', { error });
    throw error;
  } finally {
    client.release();
  }
}

// Run if executed directly
if (require.main === module) {
  backfillReferralCodes()
    .then(() => {
      logger.info('[Backfill] Successfully completed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('[Backfill] Failed with error:', { error: err });
      process.exit(1);
    });
}

export { backfillReferralCodes };
