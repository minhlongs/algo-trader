/**
 * Fraud Detector
 * Detects fraudulent referral clicks using multiple signals
 */

import { getDbClient } from '../shared/db/postgres-client';
import { logger } from '../shared/utils/logger';

export interface FraudDetectionConfig {
  maxClicksPerIpPerDay: number;
  maxClicksPerUserAgentPerDay: number;
  suspiciousUserAgents: string[];
  fraudThreshold: number; // 0-100 score threshold
}

export class FraudDetector {
  private config: FraudDetectionConfig;

  constructor(config?: Partial<FraudDetectionConfig>) {
    this.config = {
      maxClicksPerIpPerDay: 100,
      maxClicksPerUserAgentPerDay: 50,
      suspiciousUserAgents: [
        'HeadlessChrome',
        'PhantomJS',
        'Selenium',
        'Puppeteer',
        'curl',
        'wget',
      ],
      fraudThreshold: 70,
      ...config,
    };
  }

  /**
   * Analyze a click and return fraud score and reasons
   */
  async detectFraud(trackingId: string, ip: string, userAgent: string): Promise<{
    score: number;
    reasons: string[];
    isBlocked: boolean;
  }> {
    const reasons: string[] = [];
    let score = 0;

    // Check 1: Suspicious user agent
    if (this.isSuspiciousUserAgent(userAgent)) {
      score += 40;
      reasons.push('Suspicious user agent detected');
    }

    // Check 2: High click rate from same IP
    const ipRate = await this.checkIpClickRate(ip);
    if (ipRate.isHigh) {
      score += 30;
      reasons.push(`High click volume from IP: ${ipRate.count} clicks in 24h`);
    }

    // Check 3: High click rate from same user agent
    const uaRate = await this.checkUserAgentClickRate(userAgent);
    if (uaRate.isHigh) {
      score += 20;
      reasons.push(`High click volume from user agent: ${uaRate.count} clicks in 24h`);
    }

    // Check 4: Empty or malformed user agent
    if (!userAgent || userAgent.trim().length < 10) {
      score += 20;
      reasons.push('Invalid or too short user agent');
    }

    // Check 5: Private/Reserved IP ranges
    if (this.isPrivateIp(ip)) {
      score += 30;
      reasons.push('Click from private IP range');
    }

    // Check 6: Very high speed clicks (multiple clicks within seconds from same IP)
    const rapidClicks = await this.checkRapidClicks(ip);
    if (rapidClicks) {
      score += 25;
      reasons.push('Rapid clicks detected from same IP');
    }

    const isBlocked = score >= this.config.fraudThreshold;

    return {
      score: Math.min(score, 100),
      reasons,
      isBlocked,
    };
  }

  /**
   * Check if user agent is from known bot/automation tools
   */
  private isSuspiciousUserAgent(userAgent: string): boolean {
    const ua = userAgent.toLowerCase();
    return this.config.suspiciousUserAgents.some(suspicious =>
      ua.includes(suspicious.toLowerCase())
    );
  }

  /**
   * Check if IP is from private/reserved range
   */
  private isPrivateIp(ip: string): boolean {
    // Check for localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
      return true;
    }
    // Check for IPv6 local
    if (ip.startsWith('fc00:') || ip.startsWith('fe80:')) {
      return true;
    }
    return false;
  }

  /**
   * Check click rate from same IP in last 24 hours
   */
  private async checkIpClickRate(ip: string): Promise<{ isHigh: boolean; count: number }> {
    const sql = `
      SELECT COUNT(*) as count
      FROM referral_tracking
      WHERE clicked_by_ip = $1
        AND clicked_at >= NOW() - INTERVAL '24 hours'
    `;
    const result = await getDbClient().query<{ count: number }>(sql, [ip]);
    const count = result.rows[0]?.count ?? 0;
    return { isHigh: count >= this.config.maxClicksPerIpPerDay, count };
  }

  /**
   * Check click rate from same user agent in last 24 hours
   */
  private async checkUserAgentClickRate(userAgent: string): Promise<{ isHigh: boolean; count: number }> {
    const sql = `
      SELECT COUNT(*) as count
      FROM referral_tracking
      WHERE clicked_by_user_agent = $1
        AND clicked_at >= NOW() - INTERVAL '24 hours'
    `;
    const result = await getDbClient().query<{ count: number }>(sql, [userAgent]);
    const count = result.rows[0]?.count ?? 0;
    return { isHigh: count >= this.config.maxClicksPerUserAgentPerDay, count };
  }

  /**
   * Check for rapid clicks (multiple clicks within 10 seconds from same IP)
   */
  private async checkRapidClicks(ip: string): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count
      FROM referral_tracking
      WHERE clicked_by_ip = $1
        AND clicked_at >= NOW() - INTERVAL '1 minute'
    `;
    const result = await getDbClient().query<{ count: number }>(sql, [ip]);
    const count = result.rows[0]?.count ?? 0;
    return count >= 10; // 10+ clicks in 1 minute is suspicious
  }

  /**
   * Batch analyze recent clicks for fraud patterns
   */
  async batchAnalyzeClicks(limit: number = 1000): Promise<{
    analyzed: number;
    flagged: number;
    averageScore: number;
  }> {
    const sql = `
      SELECT id, clicked_by_ip, clicked_by_user_agent
      FROM referral_tracking
      WHERE fraud_score = 0
      ORDER BY clicked_at DESC
      LIMIT $1
    `;
    const result = await getDbClient().query<
      { id: string; clicked_by_ip: string; clicked_by_user_agent: string }
    >(sql, [limit]);

    let totalScore = 0;
    let flagged = 0;

    for (const click of result.rows) {
      const detection = await this.detectFraud(click.id, click.clicked_by_ip, click.clicked_by_user_agent);
      totalScore += detection.score;

      if (detection.isBlocked) {
        flagged++;
        // Mark as fraudulent in database
        await getDbClient().query(
          `UPDATE referral_tracking SET fraud_score = $1, is_fraudulent = true WHERE id = $2`,
          [detection.score, click.id]
        );
      }
    }

    return {
      analyzed: result.rows.length,
      flagged,
      averageScore: result.rows.length > 0 ? totalScore / result.rows.length : 0,
    };
  }
}

export const fraudDetector = new FraudDetector();
