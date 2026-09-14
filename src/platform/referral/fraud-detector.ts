/**
 * Fraud Detector
 * Detects fraudulent referral clicks using multiple signals
 */

import { getDbClient } from '../../shared/db/postgres-client.js';
import {
  type FraudDetectionConfig,
  type FraudDetectionResult,
  type BatchAnalyzeResult,
  DEFAULT_FRAUD_CONFIG,
} from './fraud-detector-types';
import {
  isSuspiciousUserAgent,
  isPrivateIp,
  checkIpClickRate,
  checkUserAgentClickRate,
  checkRapidClicks,
} from './fraud-detector-rules';

export * from './fraud-detector-types';
export * from './fraud-detector-rules';

export class FraudDetector {
  private config: FraudDetectionConfig;

  constructor(config?: Partial<FraudDetectionConfig>) {
    this.config = {
      ...DEFAULT_FRAUD_CONFIG,
      ...config,
    };
  }

  /**
   * Analyze a click and return fraud score and reasons
   */
  async detectFraud(trackingId: string, ip: string, userAgent: string): Promise<FraudDetectionResult> {
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

  private isSuspiciousUserAgent(userAgent: string): boolean {
    return isSuspiciousUserAgent(userAgent, this.config.suspiciousUserAgents);
  }

  private isPrivateIp(ip: string): boolean {
    return isPrivateIp(ip);
  }

  private async checkIpClickRate(ip: string): Promise<{ isHigh: boolean; count: number }> {
    return checkIpClickRate(ip, this.config.maxClicksPerIpPerDay);
  }

  private async checkUserAgentClickRate(userAgent: string): Promise<{ isHigh: boolean; count: number }> {
    return checkUserAgentClickRate(userAgent, this.config.maxClicksPerUserAgentPerDay);
  }

  private async checkRapidClicks(ip: string): Promise<boolean> {
    return checkRapidClicks(ip);
  }

  /**
   * Batch analyze recent clicks for fraud patterns
   */
  async batchAnalyzeClicks(limit: number = 1000): Promise<BatchAnalyzeResult> {
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
