/**
 * Trial-to-Paid Email Drip Campaign Service
 * Manages automated email sequences for free trial conversion.
 * Scheduler state persisted to data/drip/scheduler.json so PM2 cron
 * restarts recover the day-sent ledger and resume without re-sending.
 */
import { EmailService } from '../notifications/email-service';
import { logger } from '../../shared/utils/logger';
import {
  type DripSubscriber,
  type DripCampaignState,
  type SchedulerState,
  type EmailTemplate,
} from './trial-drip-types';
import { DRIP_EMAIL_TEMPLATES } from './trial-drip-templates';
import {
  loadSchedulerState,
  saveSchedulerState,
  buildSchedulerSnapshot,
  rebuildSubscribers,
} from './trial-drip-state';

export { type DripSubscriber, type DripCampaignState } from './trial-drip-types';

export class TrialDripService {
  private static instance: TrialDripService;
  private subscribers: Map<string, DripSubscriber> = new Map();
  private emailService: EmailService;
  private schedulerState: SchedulerState = loadSchedulerState();
  private autoRunPending = false;
  private readonly TEMPLATES: Record<number, EmailTemplate> = DRIP_EMAIL_TEMPLATES;

  private constructor() {
    this.emailService = EmailService.getInstance();
  }

  static getInstance(): TrialDripService {
    if (!TrialDripService.instance) {
      TrialDripService.instance = new TrialDripService();
    }
    return TrialDripService.instance;
  }

  subscribe(email: string, tenantId: string, tier: string, trialDays = 7): DripSubscriber {
    const now = new Date();
    const endsAt = new Date(now.getTime() + trialDays * 86400000);

    const subscriber: DripSubscriber = {
      email,
      tenantId,
      tier,
      subscribedAt: now.toISOString(),
      trialEndsAt: endsAt.toISOString(),
      daysSinceTrialStart: 0,
      lastEmailDay: 0,
      isActive: true,
    };

    this.subscribers.set(tenantId, subscriber);
    logger.info('[TrialDrip] Subscriber registered', { email, tenantId, tier });
    this.autoRunPending = true;
    this.persistSchedulerState();
    return subscriber;
  }

  unsubscribe(tenantId: string): boolean {
    const sub = this.subscribers.get(tenantId);
    if (!sub) return false;
    sub.isActive = false;
    logger.info('[TrialDrip] Subscriber unsubscribed', { tenantId });
    this.persistSchedulerState();
    return true;
  }

  async processDueEmails(): Promise<{ sent: number; skipped: number; errors: number }> {
    if (this.subscribers.size === 0 && Object.keys(this.schedulerState.subscribers).length > 0) {
      this.autoRunPending = rebuildSubscribers(this.schedulerState, this.subscribers);
    }

    const hasActive = Array.from(this.subscribers.values()).some((s) => s.isActive);
    if (!hasActive || !this.autoRunPending) {
      return { sent: 0, skipped: 0, errors: 0 };
    }
    this.autoRunPending = false;
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const [tenantId, sub] of this.subscribers) {
      if (!sub.isActive) {
        skipped++;
        continue;
      }

      const daysSinceStart = Math.floor((Date.now() - new Date(sub.subscribedAt).getTime()) / 86400000);
      sub.daysSinceTrialStart = daysSinceStart;

      const eligibleDays = Object.keys(this.TEMPLATES)
        .map(Number)
        .filter((d) => d <= daysSinceStart && d > sub.lastEmailDay)
        .sort((a, b) => a - b);

      for (const day of eligibleDays) {
        const template = this.TEMPLATES[day];
        if (!template) continue;

        try {
          const email = template(sub);
          const success = await this.emailService.send({
            to: sub.email,
            subject: email.subject,
            body: email.body,
            html: email.html,
          });

          if (success) {
            sub.lastEmailDay = day;
            sent++;
            logger.info('[TrialDrip] Email sent', { tenantId, day, subject: email.subject });
            this.persistSchedulerState();
          } else {
            errors++;
            logger.warn('[TrialDrip] Email send failed', { tenantId, day });
          }
        } catch (err) {
          errors++;
          logger.error('[TrialDrip] Email error', { tenantId, day, error: String(err) });
        }
      }
    }

    return { sent, skipped, errors };
  }

  getState(): { activeSubscribers: number; totalSubscribers: number } {
    const activeSubscribers = Array.from(this.subscribers.values()).filter((s) => s.isActive).length;
    return { activeSubscribers, totalSubscribers: this.subscribers.size };
  }

  private persistSchedulerState(): void {
    this.schedulerState = buildSchedulerSnapshot(this.subscribers, this.autoRunPending);
    saveSchedulerState(this.schedulerState);
  }

  getSubscriber(tenantId: string): DripSubscriber | undefined {
    return this.subscribers.get(tenantId);
  }
}
