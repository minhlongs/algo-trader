/** CustomerSuccessAgent — churn detection, trial onboarding, upgrade nudges */

import { TrialDripService } from '../platform/billing/trial-drip-service';
import { logger } from '../shared/utils/logger';
import type { ChurnScore, ChurnSignal } from './types/churn-model';

export class CustomerSuccessAgent {
  private churnScores: Map<string, ChurnScore> = new Map();

  /** On new trial start, register with drip campaign and initialize churn tracking. */
  onTrialStart(tenantId: string, email: string, tier: string): void {
    const service = TrialDripService.getInstance();
    service.subscribe(email, tenantId, tier);
    logger.info('[CustomerSuccess] Trial started — drip campaign triggered', { tenantId, email, tier });
  }

  /** Compute churn scores for all active users. */
  detectChurn(
    users: Array<{
      userId: string;
      daysSinceActive: number;
      trialDaysLeft?: number;
      usageDropPct?: number;
    }>,
  ): ChurnScore[] {
    const results: ChurnScore[] = [];

    for (const user of users) {
      const signals = this.buildSignals(user);
      const maxSignals = 4;
      const score = signals.length / maxSignals;

      const churnScore: ChurnScore = {
        userId: user.userId,
        score,
        signals,
        calculatedAt: new Date(),
      };

      this.churnScores.set(user.userId, churnScore);
      results.push(churnScore);

      if (signals.length > 0) {
        logger.info('[CustomerSuccess] Churn risk detected', {
          userId: user.userId,
          score,
          signalCount: signals.length,
          signals: signals.map((s) => s.reason),
        });
      }
    }

    return results;
  }

  /** Send upgrade nudge (day 7 milestone). */
  triggerUpgradeNudge(userId: string): void {
    logger.info('[CustomerSuccess] Upgrade nudge triggered', { userId });
  }

  /** Get current churn score for a user. */
  getChurnScore(userId: string): ChurnScore | undefined {
    return this.churnScores.get(userId);
  }

  private buildSignals(user: {
    userId: string;
    daysSinceActive: number;
    trialDaysLeft?: number;
    usageDropPct?: number;
  }): ChurnSignal[] {
    const signals: ChurnSignal[] = [];

    if (user.daysSinceActive > 7) {
      signals.push({
        reason: 'inactive_7d',
        severity: 'high',
        detail: `No activity for ${user.daysSinceActive} days`,
      });
    }

    if (user.trialDaysLeft !== undefined && user.trialDaysLeft < 3) {
      signals.push({
        reason: 'trial_ending_soon',
        severity: user.trialDaysLeft < 1 ? 'high' : 'medium',
        detail: `Trial ends in ${user.trialDaysLeft} days`,
      });
    }

    if (user.usageDropPct !== undefined && user.usageDropPct > 50) {
      signals.push({
        reason: 'usage_drop_50pct',
        severity: 'medium',
        detail: `Usage dropped ${user.usageDropPct}% from baseline`,
      });
    }

    return signals;
  }
}
