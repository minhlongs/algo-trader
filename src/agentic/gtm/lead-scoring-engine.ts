/**
 * Behavioral Lead Scoring Engine
 *
 * Computes deterministic multi-factor lead quality scores (0-100) and
 * maps leads into COLD, WARM, HOT, and QUALIFIED categories.
 *
 * @module agentic/gtm/lead-scoring-engine
 */

import type {
  LeadAttributionRecord,
  LeadQualification,
  LeadScoreResult,
} from './lead-attribution-types';

export interface LeadScoringWeights {
  touchpointWeight?: number;
  referralBonus?: number;
  multiNetworkBonus?: number;
  recencyWeight?: number;
  emailPresenceBonus?: number;
}

export class LeadScoringEngine {
  private readonly touchpointWeight: number;
  private readonly referralBonus: number;
  private readonly multiNetworkBonus: number;
  private readonly recencyWeight: number;
  private readonly emailPresenceBonus: number;

  constructor(weights?: LeadScoringWeights) {
    this.touchpointWeight = weights?.touchpointWeight ?? 8;
    this.referralBonus = weights?.referralBonus ?? 25;
    this.multiNetworkBonus = weights?.multiNetworkBonus ?? 15;
    this.recencyWeight = weights?.recencyWeight ?? 20;
    this.emailPresenceBonus = weights?.emailPresenceBonus ?? 20;
  }

  public scoreLead(record: LeadAttributionRecord, now: number = Date.now()): LeadScoreResult {
    let score = 0;
    const reasons: string[] = [];

    // 1. Touchpoint frequency (capped at 5 touchpoints)
    const touchCount = record.touchpoints.length;
    const touchScore = Math.min(touchCount * this.touchpointWeight, 40);
    if (touchScore > 0) {
      score += touchScore;
      reasons.push(`${touchCount} touchpoint(s) recorded (+${touchScore})`);
    }

    // 2. Referral code presence
    const hasReferral = record.touchpoints.some((t) => Boolean(t.referralCode));
    if (hasReferral) {
      score += this.referralBonus;
      reasons.push(`Direct affiliate referral attribution (+${this.referralBonus})`);
    }

    // 3. Multi-network engagement diversity
    const distinctNetworks = new Set(record.touchpoints.map((t) => t.network)).size;
    if (distinctNetworks > 1) {
      score += this.multiNetworkBonus;
      reasons.push(`Cross-network touchpoint engagement across ${distinctNetworks} channels (+${this.multiNetworkBonus})`);
    }

    // 4. Contact info capture
    if (record.email && record.email.includes('@')) {
      score += this.emailPresenceBonus;
      reasons.push(`Verified email address provided (+${this.emailPresenceBonus})`);
    }

    // 5. Recency decay (within 48 hours gets full bonus, drops linearly over 30 days)
    const ageHours = Math.max(0, (now - record.lastSeenAt) / (1000 * 60 * 60));
    if (ageHours <= 48) {
      score += this.recencyWeight;
      reasons.push(`Active within last 48 hours (+${this.recencyWeight})`);
    } else if (ageHours <= 720) {
      const recencyScore = Math.round(this.recencyWeight * (1 - ageHours / 720));
      if (recencyScore > 0) {
        score += recencyScore;
        reasons.push(`Recent activity within 30 days (+${recencyScore})`);
      }
    }

    const finalScore = Math.min(100, Math.max(0, score));
    const qualification = this.categorizeScore(finalScore);

    return {
      leadId: record.leadId,
      score: finalScore,
      qualification,
      reasons,
      evaluatedAt: now,
    };
  }

  private categorizeScore(score: number): LeadQualification {
    if (score >= 80) return 'QUALIFIED';
    if (score >= 60) return 'HOT';
    if (score >= 35) return 'WARM';
    return 'COLD';
  }
}
