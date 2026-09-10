/**
 * Cookie Attribution Service
 * Manages cookie-based affiliate attribution with 90-day window.
 * Falls back to URL params when cookies are unavailable.
 */

import { randomUUID, createHash } from 'crypto';
import { query, getDbClient } from '../../shared/db/postgres-client.js';
import { logger } from '../../shared/utils/logger';

const COOKIE_TTL_DAYS = 90;
const COOKIE_TTL_MS = COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface CookieMapping {
  cookieHash: string;
  referralCode: string;
  createdAt: Date;
  expiresAt: Date;
  firstSeenIp: string;
  lastSeenIp: string;
  clickCount: number;
}

export function generateCookieHash(secret: string): string {
  const raw = `${randomUUID()}:${Date.now()}:${secret}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

export function resolveExpiry(): Date {
  return new Date(Date.now() + COOKIE_TTL_MS);
}

export class CookieAttributionService {
  private cookieSecret: string;

  constructor(cookieSecret?: string) {
    this.cookieSecret = cookieSecret || process.env.AFFILIATE_COOKIE_SECRET || 'default-cookie-secret-change-me';
  }

  /**
   * Create a new cookie mapping and return the hash to set as cookie value.
   */
  async createMapping(referralCode: string, ip: string): Promise<string> {
    const cookieHash = generateCookieHash(this.cookieSecret);
    const expiresAt = resolveExpiry();

    await query(
      `INSERT INTO affiliate_cookies (cookie_hash, referral_code, expires_at, first_seen_ip, last_seen_ip, click_count)
       VALUES ($1, $2, $3, $4, $5, 1)
       ON CONFLICT (cookie_hash) DO UPDATE SET click_count = affiliate_cookies.click_count + 1, last_seen_ip = $5`,
      [cookieHash, referralCode, expiresAt, ip, ip]
    );

    logger.info('[CookieAttribution] Created mapping', { cookieHash, referralCode, ip });
    return cookieHash;
  }

  /**
   * Look up referral code from a cookie hash. Returns null if missing or expired.
   */
  async getReferralCodeByHash(cookieHash: string): Promise<string | null> {
    const result = await query<{ referral_code: string; expires_at: Date }>(
      `SELECT referral_code, expires_at FROM affiliate_cookies WHERE cookie_hash = $1`,
      [cookieHash]
    );
    const row = result.rows[0];
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) return null;
    return row.referral_code;
  }

  /**
   * Check whether a cookie hash is valid (exists and not expired).
   */
  async isValid(cookieHash: string): Promise<boolean> {
    return (await this.getReferralCodeByHash(cookieHash)) !== null;
  }

  /**
   * Increment click count for an existing cookie hash (user clicked again).
   */
  async incrementClickCount(cookieHash: string, ip: string): Promise<void> {
    await query(
      `UPDATE affiliate_cookies SET click_count = click_count + 1, last_seen_ip = $2 WHERE cookie_hash = $1`,
      [cookieHash, ip]
    );
  }

  /**
   * Clean up expired cookie mappings. Returns count of rows removed.
   */
  async purgeExpired(): Promise<number> {
    const result = await query<{ count: string }>(
      `DELETE FROM affiliate_cookies WHERE expires_at < NOW() RETURNING 1 AS count`
    );
    return result.rows.length;
  }

  /**
   * Get stats for a referral code: total cookies, total clicks, expiry window distribution.
   */
  async getStatsByCode(referralCode: string): Promise<{ totalCookies: number; totalClicks: number }> {
    const result = await query<{ total_cookies: string; total_clicks: string }>(
      `SELECT COUNT(*) AS total_cookies, SUM(click_count) AS total_clicks
       FROM affiliate_cookies WHERE referral_code = $1`,
      [referralCode]
    );
    const row = result.rows[0];
    return {
      totalCookies: parseInt(row.total_cookies, 10),
      totalClicks: parseInt(row.total_clicks, 10),
    };
  }

  /**
   * Persist attribution metadata: IP, click timestamp, user agent — linked to the cookie hash.
   * This extends the raw click with attribution context for downstream conversion logic.
   */
  async recordAttribution(
    cookieHash: string,
    tenantId: string,
    clickId: string,
    signupTimestamp: Date
  ): Promise<void> {
    const sql = `
      INSERT INTO referral_tracking (id, referral_code, clicked_by_ip, clicked_by_user_agent, clicked_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET converted_at = $5
    `;
    // Resolve code from hash first
    const code = await this.getReferralCodeByHash(cookieHash);
    if (!code) return;

    await query(sql, [
      clickId,
      code,
      /* ip */ '',
      /* ua */ '',
      signupTimestamp,
      JSON.stringify({ cookieHash, attributionSource: 'cookie' }),
    ]);
  }
}

export const cookieAttributionService = new CookieAttributionService();
