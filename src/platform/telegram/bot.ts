/**
 * Telegram Bot Service
 * Handles threshold alerts and user commands via Telegram.
 * Command handler implementations live in ./bot-command-handlers.ts
 */

import { Bot, Context } from 'grammy';
import { logger } from '../../shared/utils/logger';
import { userSessionRepo } from './user-session-repository-d1';
import type { TelegramConfig, UserSession } from './bot-types';
import { registerBotCommands } from './bot-command-registration';
import {
  applyTelegramRateLimit,
  sendTelegramThresholdAlert,
  sendTelegramToAllLinkedUsers,
} from './bot-alert-dispatcher';

export type { TelegramConfig, UserSession };

export class TelegramBotService {
  private static instance: TelegramBotService;
  private config: TelegramConfig;
  private bot: Bot<Context> | null = null;
  private initialized: boolean = false;
  private rateLimitDelay: number = 1000; // 1 second between messages
  private redisKeyPrefix: string = 'algo:rate_limit:telegram:';

  private constructor(config?: TelegramConfig) {
    this.config = config || {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    };
  }

  static getInstance(config?: TelegramConfig): TelegramBotService {
    if (!TelegramBotService.instance) {
      TelegramBotService.instance = new TelegramBotService(config);
    }
    return TelegramBotService.instance;
  }

  initialize(): boolean {
    if (!this.config.botToken) {
      logger.warn('[TelegramBot] Missing TELEGRAM_BOT_TOKEN');
      return false;
    }

    try {
      this.bot = new Bot<Context>(this.config.botToken);
      this.setupMiddleware(); // Session creation FIRST
      this.setupCommands();   // Command handlers SECOND (can read sessions)
      this.initialized = true;
      logger.info('[TelegramBot] Initialized with Telegram');
      return true;
    } catch (error) {
      logger.error('[TelegramBot] Initialization failed:', { error });
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async start(): Promise<void> {
    if (!this.bot) {
      throw new Error('TelegramBot not initialized');
    }

    // Ensure D1 table exists before handling any commands
    await userSessionRepo.ensureTable();

    this.bot.start({
      onStart: (info) => {
        logger.info(`[TelegramBot] Running as @${info.username}`);
      },
    });

    this.bot.catch((error) => {
      logger.error('[TelegramBot] Error:', { error });
    });

    this.initialized = true;
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.initialized = false;
      logger.info('[TelegramBot] Stopped');
    }
  }

  private setupCommands(): void {
    if (!this.bot) return;
    registerBotCommands(this.bot);
  }

  private setupMiddleware(): void {
    if (!this.bot) return;

    // Sessions are persisted in D1 — no auto-creation needed.
    this.bot.use(async (_ctx: Context, next: () => Promise<void>) => next());
  }

  async sendThresholdAlert(
    chatId: number,
    licenseKey: string,
    threshold: number,
    currentUsage: number,
    dailyLimit: number,
    percentUsed: number,
  ): Promise<boolean> {
    return sendTelegramThresholdAlert(
      this.bot,
      this.initialized,
      chatId,
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
      (cId) => this.applyRateLimitRedis(cId),
    );
  }

  async sendToAllLinkedUsers(
    licenseKey: string,
    threshold: number,
    currentUsage: number,
    dailyLimit: number,
    percentUsed: number,
  ): Promise<number> {
    return sendTelegramToAllLinkedUsers(
      (userId, lk, th, cu, dl, pu) =>
        this.sendThresholdAlert(userId, lk, th, cu, dl, pu),
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
    );
  }

  /**
   * Redis-backed rate limiting for crash resilience
   */
  private async applyRateLimitRedis(chatId: number): Promise<void> {
    await applyTelegramRateLimit(chatId, this.redisKeyPrefix, this.rateLimitDelay);
  }

  async getUserSession(userId: number): Promise<UserSession | undefined> {
    return userSessionRepo.getByUserId(userId);
  }

  async linkLicenseKey(userId: number, licenseKey: string): Promise<void> {
    await userSessionRepo.linkLicenseKey(userId, licenseKey);
  }

  async unlinkLicenseKey(userId: number, licenseKey: string): Promise<void> {
    await userSessionRepo.unlinkLicenseKey(userId, licenseKey);
  }
}

export const telegramBotService = TelegramBotService.getInstance();
