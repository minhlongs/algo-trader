import type { Context } from 'grammy';
import type { ChurnSignal, LeadHunterState } from './types/lead-hunter-types';
import { UserLinkStore, UserLink } from '../platform/telegram/user-link-store';
import { logger } from '../shared/utils/logger';

const WELCOME_MESSAGE = `🎣 *Welcome to Algo Trader!*

You're all linked up. Here's what I can do:

• /status — Check your usage & limits
• /limits — View your tier limits
• /notifications — Toggle Telegram alerts

I'll check in on you periodically to make sure you're getting value. Need help? Just ask!`;

const CHECKIN_MESSAGE = `👋 Hey! Just checking in — how's trading going?

If you need anything, just reply here or use /help to see what's available.`;

export class LeadHunterAgent {
  constructor(
    private userLinkStore: UserLinkStore,
    private telegramBotApi: Context['api']
  ) {}

  async onNewSignup(telegramUserId: number, licenseId: string): Promise<void> {
    this.userLinkStore.link(telegramUserId, licenseId);

    const state = await this.getOrCreateState(telegramUserId, licenseId);
    if (!state.welcomeSent) {
      await this.sendWelcome(telegramUserId);
      state.welcomeSent = true;
    }
  }

  async sendWelcome(telegramUserId: number): Promise<void> {
    try {
      await this.telegramBotApi.sendMessage(telegramUserId, WELCOME_MESSAGE, {
        parse_mode: 'Markdown',
      });
      logger.info(`[LeadHunter] Welcome sent to ${telegramUserId}`);
    } catch (error) {
      logger.error(`[LeadHunter] Welcome failed for ${telegramUserId}:`, { error });
    }
  }

  async sendDailyCheckIn(telegramUserIds: number[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const userId of telegramUserIds) {
      try {
        await this.telegramBotApi.sendMessage(userId, CHECKIN_MESSAGE, {
          parse_mode: 'Markdown',
        });
        sent++;
        // Rate limit: 1 second between messages
        await this.delay(1000);
      } catch (error) {
        failed++;
        logger.warn(`[LeadHunter] Check-in failed for ${userId}:`, { error });
      }
    }

    logger.info(`[LeadHunter] Daily check-in: sent=${sent}, failed=${failed}`);
    return { sent, failed };
  }

  detectChurnRisk(
    telegramUserId: number,
    daysSinceActive: number,
    trialDaysLeft?: number
  ): ChurnSignal[] {
    const signals: ChurnSignal[] = [];

    if (daysSinceActive >= 7) {
      signals.push({
        reason: 'inactive_7d',
        severity: daysSinceActive >= 14 ? 'high' : 'medium',
        detail: `User inactive for ${daysSinceActive} days`,
      });
    }

    if (trialDaysLeft !== undefined && trialDaysLeft <= 3 && trialDaysLeft >= 0) {
      signals.push({
        reason: 'trial_ending',
        severity: trialDaysLeft <= 1 ? 'high' : 'medium',
        detail: `Trial expires in ${trialDaysLeft} day(s)`,
      });
    }

    if (signals.length === 0) {
      signals.push({
        reason: 'usage_drop',
        severity: 'low',
        detail: 'No usage drop detected — user appears healthy',
      });
    }

    return signals;
  }

  async escalateToHuman(licenseId: string, reason: string): Promise<void> {
    logger.warn(`[LeadHunter] ESCALATION: license=${licenseId}, reason=${reason}`);
    // Hook for operator notification — email/webhook/etc.
    // Placeholder: dispatch to operator dashboard or Slack webhook.
  }

  async getState(telegramUserId: number): Promise<LeadHunterState | undefined> {
    const link = this.userLinkStore.getByTelegramUserId(telegramUserId);
    if (!link) return undefined;

    return this.getOrCreateState(telegramUserId, link.licenseId);
  }

  private async getOrCreateState(
    telegramUserId: number,
    licenseId: string
  ): Promise<LeadHunterState> {
    // In-memory cache per runtime instance.
    // For cross-process, extend with D1 or KV storage.
    const cache = getStateCache();
    const key = `${telegramUserId}:${licenseId}`;
    if (!cache.has(key)) {
      cache.set(key, {
        telegramUserId,
        licenseId,
        churnSignals: [],
        welcomeSent: false,
        lastCheckIn: null,
        escalationSent: false,
      });
    }
    return cache.get(key)!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Per-instance state cache (cleared on restart)
function getStateCache(): Map<string, LeadHunterState> {
  const globalKey = '__leadhunter_state_cache';
  if (!(globalThis as Record<string, unknown>)[globalKey]) {
    (globalThis as Record<string, unknown>)[globalKey] = new Map<string, LeadHunterState>();
  }
  return (globalThis as Record<string, unknown>)[globalKey] as Map<string, LeadHunterState>;
}
