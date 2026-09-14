/**
 * Rule evaluation and query helpers for Referral Fraud Detector.
 */

import { getDbClient } from '../../shared/db/postgres-client.js';

/**
 * Check if user agent is from known bot/automation tools
 */
export function isSuspiciousUserAgent(userAgent: string, suspiciousUserAgents: string[]): boolean {
  const ua = userAgent.toLowerCase();
  return suspiciousUserAgents.some(suspicious =>
    ua.includes(suspicious.toLowerCase())
  );
}

/**
 * Check if IP is from private/reserved range
 */
export function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return true;
  }
  if (ip.startsWith('fc00:') || ip.startsWith('fe80:')) {
    return true;
  }
  return false;
}

/**
 * Check click rate from same IP in last 24 hours
 */
export async function checkIpClickRate(
  ip: string,
  maxClicks: number
): Promise<{ isHigh: boolean; count: number }> {
  const sql = `
    SELECT COUNT(*) as count
    FROM referral_tracking
    WHERE clicked_by_ip = $1
      AND clicked_at >= NOW() - INTERVAL '24 hours'
  `;
  const result = await getDbClient().query<{ count: number }>(sql, [ip]);
  const count = result.rows[0]?.count ?? 0;
  return { isHigh: count >= maxClicks, count };
}

/**
 * Check click rate from same user agent in last 24 hours
 */
export async function checkUserAgentClickRate(
  userAgent: string,
  maxClicks: number
): Promise<{ isHigh: boolean; count: number }> {
  const sql = `
    SELECT COUNT(*) as count
    FROM referral_tracking
    WHERE clicked_by_user_agent = $1
      AND clicked_at >= NOW() - INTERVAL '24 hours'
  `;
  const result = await getDbClient().query<{ count: number }>(sql, [userAgent]);
  const count = result.rows[0]?.count ?? 0;
  return { isHigh: count >= maxClicks, count };
}

/**
 * Check for rapid clicks (multiple clicks within 10 seconds from same IP)
 */
export async function checkRapidClicks(ip: string): Promise<boolean> {
  const sql = `
    SELECT COUNT(*) as count
    FROM referral_tracking
    WHERE clicked_by_ip = $1
      AND clicked_at >= NOW() - INTERVAL '1 minute'
  `;
  const result = await getDbClient().query<{ count: number }>(sql, [ip]);
  const count = result.rows[0]?.count ?? 0;
  return count >= 10;
}
