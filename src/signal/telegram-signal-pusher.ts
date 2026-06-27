/**
 * Telegram Signal Pusher
 * Pushes signals to subscribed Telegram chat IDs.
 * Throttle: per-tier rate limits (30 msg/sec channel cap respected via queue).
 * Reuses existing TELEGRAM_BOT_TOKEN env var; no new deps.
 */

import { logger } from '../utils/logger';
import type { Signal, SignalSubscription, TierKey } from './signal-types';
import { TIER_SIGNAL_CONFIG } from './signal-types';

/** Minimum ms between pushes to a single chat_id per tier */
const THROTTLE_MS: Record<TierKey, number> = {
  FREE: 24 * 60 * 60 * 1000,  // 1 per day
  PRO: 60 * 60 * 1000,        // 1 per hour
  ENTERPRISE: 5_000,           // max 1 per 5s (Telegram API limit guard)
};

export class TelegramSignalPusher {
  private botToken: string;
  /** chatId → last push ts */
  private lastPush: Map<number, number> = new Map();
  /** Simple in-memory queue: [chatId, text][] */
  private queue: Array<[number, string]> = [];
  private flushing = false;

  constructor(botToken?: string) {
    this.botToken = botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  }

  /** Format signal into readable Telegram message */
  private formatSignal(signal: Signal): string {
    const dir = signal.side === 'BUY' ? '📈 BUY' : '📉 SELL';
    const conf = (signal.confidence * 100).toFixed(1);
    const ttlMin = Math.round(signal.ttl / 60);
    return (
      `*Signal Alert*\n` +
      `${dir} ${signal.market}\n` +
      `Strategy: \`${signal.strategy}\`\n` +
      `Size: ${signal.size.toFixed(4)} | Confidence: ${conf}%\n` +
      `TTL: ${ttlMin}min | ID: \`${signal.id.slice(0, 8)}\``
    );
  }

  /** Enqueue push for a subscription if within throttle window */
  enqueue(signal: Signal, sub: SignalSubscription): void {
    if (!sub.active || !sub.chatId) return;

    const tier = sub.tier as TierKey;
    const config = TIER_SIGNAL_CONFIG[tier];
    if (signal.confidence < config.minConfidence) return;

    const throttle = THROTTLE_MS[tier];
    const last = this.lastPush.get(sub.chatId) ?? 0;
    if (Date.now() - last < throttle) return;

    this.lastPush.set(sub.chatId, Date.now());
    this.queue.push([sub.chatId, this.formatSignal(signal)]);
    void this.flushQueue();
  }

  /** Drain queue sequentially (respects Telegram 30 msg/sec limit) */
  private async flushQueue(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      const [chatId, text] = item;
      await this.sendMessage(chatId, text);
      // Small delay to stay well under 30 msg/sec global limit
      await new Promise((r) => setTimeout(r, 50));
    }

    this.flushing = false;
  }

  /** Send single Telegram message via Bot API */
  async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.botToken) {
      logger.warn('[TelegramPusher] No TELEGRAM_BOT_TOKEN configured');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.error(`[TelegramPusher] Send failed: ${res.status} ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      logger.error('[TelegramPusher] Network error', { err });
      return false;
    }
  }

<<<<<<< HEAD
  /**
   * Send an admin alert to the configured TELEGRAM_CHAT_ID.
   * Used by drawdown monitor for breach notifications.
   */
  async sendAdminAlert(text: string): Promise<boolean> {
    const chatIdRaw = process.env.TELEGRAM_CHAT_ID;
    if (!chatIdRaw) {
      logger.warn('[TelegramPusher] TELEGRAM_CHAT_ID not configured — admin alert dropped');
      return false;
    }
    const chatId = parseInt(chatIdRaw, 10);
    if (isNaN(chatId)) {
      logger.warn('[TelegramPusher] TELEGRAM_CHAT_ID invalid number');
      return false;
    }
    return this.sendMessage(chatId, text);
  }

=======
>>>>>>> origin/feat/qwen-signal-daemon-phase03
  /** Visible for tests */
  get queueLength(): number {
    return this.queue.length;
  }
}

export const telegramSignalPusher = new TelegramSignalPusher();
