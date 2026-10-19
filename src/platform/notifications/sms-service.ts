/**
 * SMS Service - Twilio Integration
 * Handles threshold alert SMS notifications for urgent usage monitoring
 */

import twilio from 'twilio';
import { logger } from '../../shared/utils/logger';
import { formatSmsBody } from './alert-formatter';
import {
  applySmsRateLimitRedis,
  checkSmsDailyLimitRedis,
  incrementSmsDailyCountRedis,
} from './sms-redis-limiter';

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  fromPhoneNumber: string;
}

export interface SmsNotification {
  to: string;
  message: string;
}

export class SmsService {
  private static instance: SmsService;
  private config: SmsConfig;
  private client: ReturnType<typeof twilio> | null = null;
  private initialized: boolean = false;
  private rateLimitDelay: number = 5000;
  private dailyLimit: number = 10;
  private redisKeyPrefix: string = 'algo:rate_limit:sms:';

  private constructor(config?: SmsConfig) {
    this.config = config || {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    };
  }

  static getInstance(config?: SmsConfig): SmsService {
    if (!SmsService.instance) {
      SmsService.instance = new SmsService(config);
    }
    return SmsService.instance;
  }

  initialize(): boolean {
    if (!this.config.accountSid || !this.config.authToken || !this.config.fromPhoneNumber) {
      logger.warn('[SmsService] Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER');
      return false;
    }

    try {
      this.client = twilio(this.config.accountSid, this.config.authToken);
      this.initialized = true;
      logger.info('[SmsService] Initialized with Twilio');
      return true;
    } catch (error) {
      logger.error('[SmsService] Initialization failed:', { error });
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async send(notification: SmsNotification): Promise<boolean> {
    if (!this.initialized || !this.client) {
      logger.warn('[SmsService] Not initialized, skipping SMS');
      return false;
    }

    await applySmsRateLimitRedis(this.redisKeyPrefix, this.rateLimitDelay);

    if (!(await checkSmsDailyLimitRedis(this.redisKeyPrefix, notification.to, this.dailyLimit))) {
      logger.warn(`[SmsService] Daily limit reached for ${notification.to}`);
      return false;
    }

    try {
      const message = await this.client.messages.create({
        body: notification.message,
        from: this.config.fromPhoneNumber,
        to: notification.to,
      });

      await incrementSmsDailyCountRedis(this.redisKeyPrefix, notification.to);
      logger.info(`[SmsService] SMS sent to ${notification.to}: ${message.sid}`);
      return true;
    } catch (error) {
      logger.error('[SmsService] Send failed:', { error });
      return false;
    }
  }

  async sendThresholdAlert(
    recipient: string,
    licenseKey: string,
    threshold: number,
    currentUsage: number,
    dailyLimit: number,
    percentUsed: number
  ): Promise<boolean> {
    if (threshold < 90) {
      logger.info(`[SmsService] Skipping SMS for threshold ${threshold}% (< 90%)`);
      return false;
    }

    const message = formatSmsBody({
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
    });

    return this.send({
      to: recipient,
      message,
    });
  }

  setRateLimit(delayMs: number): void {
    this.rateLimitDelay = delayMs;
  }

  setDailyLimit(limit: number): void {
    this.dailyLimit = limit;
  }
}

export const smsService = SmsService.getInstance();
