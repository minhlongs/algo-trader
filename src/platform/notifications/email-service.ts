/**
 * Email Service - SendGrid Integration
 * Handles threshold alert emails for usage monitoring
 */

import sgMail from '@sendgrid/mail';
import { logger } from '../../shared/utils/logger';
import { formatAlert } from './alert-formatter';
import type { EmailConfig, EmailNotification } from './email-service-types';
import { generatePlainTextBody, generateHtmlBody } from './email-service-formatters';
import { applyEmailRateLimit } from './email-service-rate-limiter';

export type { EmailConfig, EmailNotification };

export class EmailService {
  private static instance: EmailService;
  private config: EmailConfig;
  private initialized: boolean = false;
  private rateLimitDelay: number = 1000; // 1 second between emails
  private redisKeyPrefix: string = 'algo:rate_limit:email:';

  private constructor(config?: EmailConfig) {
    this.config = config || {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.SENDGRID_FROM_EMAIL || '',
      fromName: process.env.SENDGRID_FROM_NAME || 'Algo Trader',
    };
  }

  static getInstance(config?: EmailConfig): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService(config);
    }
    return EmailService.instance;
  }

  /**
   * Startup health check: fails loudly if SENDGRID_API_KEY is missing in production.
   * Call during app initialization to catch misconfiguration early.
   */
  static startupCheck(): void {
    if (process.env.NODE_ENV !== 'production') return;
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!apiKey) {
      throw new Error(
        '[EmailService] FATAL: SENDGRID_API_KEY is not set. Email service cannot start in production. ' +
        'Set SENDGRID_API_KEY in your environment or .env file.'
      );
    }
    if (!fromEmail) {
      throw new Error(
        '[EmailService] FATAL: SENDGRID_FROM_EMAIL is not set. Email service cannot start in production. ' +
        'Set SENDGRID_FROM_EMAIL in your environment or .env file.'
      );
    }
    logger.info('[EmailService] Startup check passed: SENDGRID_API_KEY is configured');
  }

  initialize(): boolean {
    if (!this.config.apiKey || !this.config.fromEmail) {
      logger.warn('[EmailService] Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL');
      return false;
    }

    try {
      sgMail.setApiKey(this.config.apiKey);
      this.initialized = true;
      logger.info('[EmailService] Initialized with SendGrid');
      return true;
    } catch (error) {
      logger.error('[EmailService] Initialization failed:', { error });
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async send(notification: EmailNotification): Promise<boolean> {
    if (!this.initialized) {
      logger.warn('[EmailService] Not initialized, skipping email');
      return false;
    }

    // Rate limiting via Redis
    await applyEmailRateLimit(this.redisKeyPrefix, this.rateLimitDelay);

    try {
      const msg: sgMail.MailDataRequired = {
        to: notification.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName,
        },
        subject: notification.subject,
        text: notification.body,
        ...(notification.html ? { html: notification.html } : {}),
      };

      await sgMail.send(msg);
      logger.info(`[EmailService] Email sent to ${notification.to}: ${notification.subject}`);
      return true;
    } catch (error) {
      logger.error('[EmailService] Send failed:', { error });
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
    const { urgency, urgencyColor } = formatAlert({
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
    });

    const subject = `[${urgency}] Usage Alert: ${threshold}% threshold reached`;

    const body = generatePlainTextBody(
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
      urgency
    );

    const html = generateHtmlBody(
      licenseKey,
      threshold,
      currentUsage,
      dailyLimit,
      percentUsed,
      urgency,
      urgencyColor
    );

    return this.send({
      to: recipient,
      subject,
      body,
      html,
    });
  }

  setRateLimit(delayMs: number): void {
    this.rateLimitDelay = delayMs;
  }
}

export const emailService = EmailService.getInstance();
