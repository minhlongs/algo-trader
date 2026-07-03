/**
 * Trial-to-Paid Email Drip Campaign Service
 * Manages automated email sequences for free trial conversion.
 *
 * Campaign schedule (7-day trial):
 *   Day 1 — Welcome + onboarding tips
 *   Day 3 — Feature spotlight (signals + Kelly sizing)
 *   Day 5 — Case study / social proof
 *   Day 7 — Trial ending + upgrade CTA
 *   Day 10 — Post-expiry: "Come back" offer
 *
 * Uses the existing EmailService for delivery.
 */

import { EmailService } from '../notifications/email-service';
import { logger } from '../../shared/utils/logger';

export interface DripSubscriber {
  email: string;
  tenantId: string;
  tier: string;
  subscribedAt: string;
  trialEndsAt: string;
  daysSinceTrialStart: number;
  lastEmailDay: number;
  isActive: boolean;
}

export interface DripCampaignState {
  subscribers: DripSubscriber[];
  lastProcessedAt: string;
}

// Template map: day number -> email content generator
type EmailTemplate = (sub: DripSubscriber) => { subject: string; body: string; html: string };

export class TrialDripService {
  private static instance: TrialDripService;
  private subscribers: Map<string, DripSubscriber> = new Map();
  private emailService: EmailService;

  private readonly TEMPLATES: Record<number, EmailTemplate> = {
    1: (sub) => ({
      subject: 'Welcome to AlgoTrader — Your 7-Day Trial Starts Now',
      body: `Hi there,\n\nWelcome to AlgoTrader! Your ${sub.tier} trial is active until ${new Date(sub.trialEndsAt).toLocaleDateString()}.\n\nHere's how to get started:\n1. Explore the dashboard at https://cashclaw.cc/dashboard\n2. Review today's signals in the Telegram bot\n3. Set your risk parameters in Settings\n\nNeed help? Join our Discord community or reply to this email.\n\n— The AlgoTrader Team`,
      html: `<h2>Welcome to AlgoTrader</h2><p>Your <strong>${sub.tier}</strong> trial is active until <strong>${new Date(sub.trialEndsAt).toLocaleDateString()}</strong>.</p><h3>Getting Started</h3><ol><li>Explore the <a href="https://cashclaw.cc/dashboard">dashboard</a></li><li>Review today's signals in the Telegram bot</li><li>Set your risk parameters in Settings</li></ol><p>Need help? Join our community or reply to this email.</p><p>— The AlgoTrader Team</p>`,
    }),
    3: (_sub: DripSubscriber) => ({
      subject: 'Your AI Edge: How Kelly Sizing Works',
      body: `Hi there,\n\nHalfway through your first week. Here's what makes AlgoTrader different:\n\n1. AI-Powered Scanning — OpenClaw scans every Polymarket market\n2. Kelly Criterion — Optimal position sizing, max 2% per trade\n3. Daily Stop-Loss — Hard-coded 5% daily drawdown limit\n\nLog in to see today's top opportunities with edge scores.\n\n— The AlgoTrader Team`,
      html: `<h2>Your AI Edge: Kelly Sizing</h2><p>Halfway through your first week. Here's what makes AlgoTrader different:</p><ul><li><strong>AI Scanning</strong> — Every Polymarket market scanned</li><li><strong>Kelly Criterion</strong> — Optimal position sizing</li><li><strong>Stop-Loss</strong> — 5% daily drawdown limit</li></ul><p><a href="https://cashclaw.cc/dashboard">View today's signals</a></p>`,
    }),
    5: (_sub: DripSubscriber) => ({
      subject: 'Real Results: Our Paper Trading Track Record',
      body: `Hi there,\n\nOur paper trading engine has been running since launch. Here's what the numbers look like:\n\n- Sharpe ratio: 1.8+\n- Win rate: 62%\n- Max drawdown: 8%\n- Total P&L: +$2,251\n\nEvery signal we sell, we trade ourselves. Full transparency.\n\nSee the live P&L: https://cashclaw.cc/trading-performance\n\n— The AlgoTrader Team`,
      html: `<h2>Real Results</h2><p>Our paper trading track record:</p><ul><li>Sharpe ratio: <strong>1.8+</strong></li><li>Win rate: <strong>62%</strong></li><li>Total P&amp;L: <strong>+$2,251</strong></li></ul><p><a href="https://cashclaw.cc/trading-performance">View live P&amp;L</a></p>`,
    }),
    7: (sub) => ({
      subject: 'Your Trial Ends Tomorrow — Don\'t Lose Access',
      body: `Hi there,\n\nYour ${sub.tier} trial ends tomorrow. To keep your access:\n\n1. Go to https://cashclaw.cc/pricing\n2. Choose your plan (Pro from $99/mo)\n3. Complete payment with USDT\n\nUpgrade now and keep your signal history, saved settings, and API access.\n\n— The AlgoTrader Team`,
      html: `<h2>Trial Ending Tomorrow</h2><p>Your <strong>${sub.tier}</strong> trial ends soon. <a href="https://cashclaw.cc/pricing">Upgrade now</a> to keep access.</p><p>Plans start from $99/mo. Pay with USDT.</p>`,
    }),
    10: (_sub: DripSubscriber) => ({
      subject: 'We Miss You — Special Offer Inside',
      body: `Hi there,\n\nYour trial expired, but we'd love to have you back. As a returning trial user, here's a special offer:\n\n- 20% off your first month with code TRIAL20\n- Priority onboarding support\n- Extended 14-day refund window\n\nReactivate now: https://cashclaw.cc/pricing?coupon=TRIAL20\n\n— The AlgoTrader Team`,
      html: `<h2>Come Back to AlgoTrader</h2><p>Your trial expired, but we'd love to have you back.</p><p>Use code <strong>TRIAL20</strong> for 20% off your first month.</p><p><a href="https://cashclaw.cc/pricing?coupon=TRIAL20">Reactivate now</a></p>`,
    }),
  };

  private constructor() {
    this.emailService = EmailService.getInstance();
  }

  static getInstance(): TrialDripService {
    if (!TrialDripService.instance) {
      TrialDripService.instance = new TrialDripService();
    }
    return TrialDripService.instance;
  }

  /**
   * Register a new trial subscriber for the drip campaign.
   */
  subscribe(email: string, tenantId: string, tier: string, trialDays: number = 7): DripSubscriber {
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
    return subscriber;
  }

  /**
   * Unsubscribe from the drip campaign (e.g., when user upgrades or cancels).
   */
  unsubscribe(tenantId: string): boolean {
    const sub = this.subscribers.get(tenantId);
    if (!sub) return false;
    sub.isActive = false;
    logger.info('[TrialDrip] Subscriber unsubscribed', { tenantId });
    return true;
  }

  /**
   * Process all active subscribers and send any due emails.
   * Designed to be called by a cron job or webhook trigger.
   * Returns count of emails sent.
   */
  async processDueEmails(): Promise<{ sent: number; skipped: number; errors: number }> {
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const [tenantId, sub] of this.subscribers) {
      if (!sub.isActive) {
        skipped++;
        continue;
      }

      const daysSinceStart = Math.floor(
        (Date.now() - new Date(sub.subscribedAt).getTime()) / 86400000
      );
      sub.daysSinceTrialStart = daysSinceStart;

      // Find the latest applicable template day that hasn't been sent yet
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

  /**
   * Get the current campaign state for monitoring.
   */
  getState(): { activeSubscribers: number; totalSubscribers: number } {
    const activeSubscribers = Array.from(this.subscribers.values()).filter((s) => s.isActive).length;
    return {
      activeSubscribers,
      totalSubscribers: this.subscribers.size,
    };
  }

  /**
   * Get subscriber details for a given tenant.
   */
  getSubscriber(tenantId: string): DripSubscriber | undefined {
    return this.subscribers.get(tenantId);
  }
}
