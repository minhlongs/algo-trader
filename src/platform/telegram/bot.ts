/**
 * Telegram Bot Service
 * Handles threshold alerts and user commands via Telegram.
 * Command handler implementations live in ./bot-command-handlers.ts
 */

import { Bot, Context } from 'grammy';
import { getRedisClient } from '../../redis';
import { logger } from '../../shared/utils/logger';
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
  handleCampaign,
  handleResults,
} from './bot-command-handlers';
import {
  handleFaq,
  handleFaqDetail,
  handleSupport,
  handlePricing,
  handleUnknownMessage,
} from './auto-support-handlers';
import { handleAsk } from './ask-handler';
import { handleLeaderboard } from './leaderboard-handler';
import { userSessionRepo } from './user-session-repository-d1';

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

    this.bot.command('start', (ctx: Context) => handleStart(ctx));
    this.bot.command('help', (ctx: Context) => handleHelp(ctx));
    this.bot.command('status', (ctx: Context) => handleStatus(ctx));
    this.bot.command('link', async (ctx: Context) => handleLink(ctx));
    this.bot.command('unlink', async (ctx: Context) => handleUnlink(ctx));
    this.bot.command('notifications', async (ctx: Context) => handleNotifications(ctx));
    this.bot.command('limits', (ctx: Context) => handleLimits(ctx));
    this.bot.command('balance', async (ctx: Context) => handleBalance(ctx));
    this.bot.command('positions', async (ctx: Context) => handlePositions(ctx));
    this.bot.command('pnl', async (ctx: Context) => handlePnl(ctx));
    this.bot.command('campaign', (ctx: Context) => handleCampaign(ctx));
    this.bot.command('results', async (ctx: Context) => handleResults(ctx));
    this.bot.command('faq', (ctx: Context) => {
      const text = (ctx.message as { text?: string })?.text || '';
      return text.trim() === '/faq' ? handleFaq(ctx) : handleFaqDetail(ctx);
    });
    this.bot.command('support', (ctx: Context) => handleSupport(ctx));
    this.bot.command('pricing', (ctx: Context) => handlePricing(ctx));
    this.bot.command('leaderboard', (ctx: Context) => handleLeaderboard(ctx));
    this.bot.command('ask', async (ctx: Context) => {
      const text = (ctx.message as { text?: string })?.text || '';
      const query = text.replace(/^\/ask(\s|@\w+)*/, '').trim();
      if (!query) {
        await ctx.reply(
          '🤖 *AI Co-pilot*\n\nAsk me anything about your trading:\n\n' +
          '• `/ask what is my risk exposure?`\n' +
          '• `/ask find arbitrage opportunities`\n' +
          '• `/ask how are my strategies performing?`\n' +
          '• `/ask what is the market doing?`\n' +
          '• `/ask generate a weekly report`\n\n' +
          'Example: `/ask what is my risk exposure?`',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      await handleAsk(ctx, query);
    });

    // Catch-all: auto-match unknown text messages to FAQ
    this.bot.on('message:text', (ctx: Context) => handleUnknownMessage(ctx));
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
    percentUsed: number
  ): Promise<boolean> {
    if (!this.initialized || !this.bot) {
      logger.warn('[TelegramBot] Not initialized, skipping message');
      return false;
    }

    await this.applyRateLimitRedis(chatId);

    const session = await userSessionRepo.getByUserId(chatId);
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

    const allSessions = await userSessionRepo.getAll();
    for (const session of allSessions) {
      if (session.licenseKeys.includes(licenseKey) && session.notificationsEnabled) {
        const success = await this.sendThresholdAlert(
          session.userId,
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
