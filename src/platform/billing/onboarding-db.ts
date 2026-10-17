/**
 * Database operations for onboarding lifecycle (signup, verify, activate).
 *
 * @module platform/billing/onboarding-db
 */

import type { PoolClient } from 'pg';
import type { LicenseTier } from '../../shared/types/license';

export async function checkActiveLicense(client: PoolClient, email: string): Promise<boolean> {
  const licResult = await client.query(
    `SELECT id FROM licenses WHERE name = $1 AND status = 'active' LIMIT 1`,
    [email],
  );
  return licResult.rows.length > 0;
}

export async function checkPendingSignup(client: PoolClient, email: string): Promise<boolean> {
  const pendingResult = await client.query(
    `SELECT id FROM onboarding_signups
     WHERE email = $1 AND status = 'pending' AND expires_at > NOW()`,
    [email],
  );
  return pendingResult.rows.length > 0;
}

export async function expireOldPendingSignups(client: PoolClient, email: string): Promise<void> {
  await client.query(
    `UPDATE onboarding_signups SET status = 'expired'
     WHERE email = $1 AND status = 'pending' AND expires_at <= NOW()`,
    [email],
  );
}

export async function insertPendingSignup(
  client: PoolClient,
  pendingId: string,
  email: string,
  tier: LicenseTier,
  verificationCode: string,
): Promise<void> {
  await client.query(
    `INSERT INTO onboarding_signups (id, email, tier, verification_code, expires_at, status)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes', 'pending')`,
    [pendingId, email, tier, verificationCode],
  );
}

export async function getPendingSignup(
  client: PoolClient,
  email: string,
): Promise<{ id: string; verification_code: string; expires_at: string } | null> {
  const result = await client.query(
    `SELECT id, verification_code, expires_at FROM onboarding_signups
     WHERE email = $1 AND status = 'pending'`,
    [email],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

export async function markSignupStatus(
  client: PoolClient,
  id: string,
  status: 'expired' | 'verified' | 'activated',
  licenseKey?: string,
): Promise<void> {
  if (status === 'activated' && licenseKey) {
    await client.query(
      `UPDATE onboarding_signups
       SET status = 'activated', license_key = $1, activated_at = NOW()
       WHERE id = $2`,
      [licenseKey, id],
    );
  } else {
    await client.query(
      `UPDATE onboarding_signups SET status = $1 WHERE id = $2`,
      [status, id],
    );
  }
}

export async function getVerifiedSignup(
  client: PoolClient,
  email: string,
): Promise<{ id: string; tier: string; expires_at: string } | null> {
  const result = await client.query(
    `SELECT id, tier, expires_at FROM onboarding_signups
     WHERE email = $1 AND status = 'verified'`,
    [email],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}
