/**
 * Telegram Bot Service
 * Handles threshold alerts and user commands via Telegram.
 * Command handler implementations live in ./bot-command-handlers.ts
 */

import { Bot, Context } from 'grammy';
import { getRedisClient } from '../redis';
import { logger } from '../utils/logger';
import { formatTelegramMessage } from '../notifications/alert-formatter';
import {
  handleStart,
  handleHelp,
  handleStatus,
  handleLink,
  handleUnlink,
  handleNotifications,
  handleLimits,
  handleBalance,
  handlePositions,
  handlePnl,
} from './bot-command-handlers';

export interface TelegramConfig {
  botToken: string;
}

export interface UserSession {
  userId: number;
  licenseKeys: string[];
  notificationsEnabled: boolean;
  lastCommand: string;
}

export class TelegramBotService {
  private static instance: TelegramBotService;
  private config: TelegramConfig;
  private bot: Bot<Context> | null = null;
  private initialized: boolean = false;
  private userSessions: Map<number, UserSession> = new Map();
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
      this.setupCommands();
      this.setupMiddleware();
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
    if (!this.bot || !this.initialized) {
      throw new Error('TelegramBot not initialized');
    }

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

    const sessions = this.userSessions;

    this.bot.command('start', (ctx: Context) => handleStart(ctx));
    this.bot.command('help', (ctx: Context) => handleHelp(ctx));
    this.bot.command('status', (ctx: Context) => handleStatus(ctx, sessions));
    this.bot.command('link', (ctx: Context) => handleLink(ctx, sessions));
    this.bot.command('unlink', (ctx: Context) => handleUnlink(ctx, sessions));
    this.bot.command('notifications', (ctx: Context) => handleNotifications(ctx, sessions));
    this.bot.command('limits', (ctx: Context) => handleLimits(ctx));
    this.bot.command('balance', (ctx: Context) => handleBalance(ctx, sessions));
    this.bot.command('positions', (ctx: Context) => handlePositions(ctx, sessions));
    this.bot.command('pnl', (ctx: Context) => handlePnl(ctx, sessions));
  }

  private setupMiddleware(): void {
    if (!this.bot) return;

    this.bot.use(async (ctx: Context, next: () => Promise<void>) => {
      const userId = ctx.from?.id;
      if (userId && !this.userSessions.has(userId)) {
        this.userSessions.set(userId, {
          userId,
          licenseKeys: [],
          notificationsEnabled: true,
          lastCommand: '',
        });
      }
      await next();
    });
  }

  async sendThresholdAlert(
    chatId: number,
    licenseKey: string,
    threshold: number,
    currentUsage: number,
    dailyLimit: number,
    percentUsed: number
  ): Promise<boolean> {
    if (!this.initialized || !this.bot) {
      logger.warn('[TelegramBot] Not initialized, skipping message');
      return false;
    }

    await this.applyRateLimitRedis(chatId);

    const session = this.userSessions.get(chatId);
    if (session && !session.notificationsEnabled) {
      logger.info(`[TelegramBot] Notifications disabled for user ${chatId}`);
      return false;
    }

    const message = formatTelegramMessage({
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
    });

    try {
      await this.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      logger.info(`[TelegramBot] Alert sent to chat ${chatId}`);
      return true;
    } catch (error) {
      logger.error('[TelegramBot] Send failed:', { error });
      return false;
    }
  }

  async sendToAllLinkedUsers(
    licenseKey: string,
    threshold: number,
    currentUsage: number,
    dailyLimit: number,
    percentUsed: number
  ): Promise<number> {
    let sentCount = 0;

    for (const [userId, session] of this.userSessions.entries()) {
      if (session.licenseKeys.includes(licenseKey) && session.notificationsEnabled) {
        const success = await this.sendThresholdAlert(
          userId,
          licenseKey,
          threshold,
          currentUsage,
          dailyLimit,
          percentUsed
        );
        if (success) sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Redis-backed rate limiting for crash resilience
   */
  private async applyRateLimitRedis(chatId: number): Promise<void> {
    try {
      const redis = getRedisClient();
      const key = `${this.redisKeyPrefix}${chatId}`;
      const lastSend = await redis.get(key);

      if (lastSend) {
        const elapsed = Date.now() - parseInt(lastSend);
        if (elapsed < this.rateLimitDelay) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - elapsed));
        }
      }

      await redis.setex(key, 3600, Date.now().toString());
    } catch (error) {
      logger.warn('[TelegramBot] Redis rate limiting failed:', { error });
    }
  }

  getUserSession(userId: number): UserSession | undefined {
    return this.userSessions.get(userId);
  }

  linkLicenseKey(userId: number, licenseKey: string): void {
    let session = this.userSessions.get(userId);
    if (!session) {
      session = { userId, licenseKeys: [], notificationsEnabled: true, lastCommand: '' };
      this.userSessions.set(userId, session);
    }

    if (!session.licenseKeys.includes(licenseKey)) {
      session.licenseKeys.push(licenseKey);
    }
  }

  unlinkLicenseKey(userId: number, licenseKey: string): void {
    const session = this.userSessions.get(userId);
    if (session) {
      const index = session.licenseKeys.indexOf(licenseKey);
      if (index > -1) {
        session.licenseKeys.splice(index, 1);
      }
    }
  }
}

export const telegramBotService = TelegramBotService.getInstance();
