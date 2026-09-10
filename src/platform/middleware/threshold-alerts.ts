/**
 * Threshold Alerts — facade
 * ROIaaS Phase 4 - Threshold alert events for usage monitoring.
 *
 * Types live in ./threshold-alerts-types
 * Dispatch/body helpers live in ./threshold-alerts-dispatch
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';
import { UsageMeteringService, ThresholdAlert } from '../metering/usage-metering-service';
import { emailService } from '../notifications/email-service';
import { smsService } from '../notifications/sms-service';
import { telegramBotService } from '../telegram/bot';
import { getActionMessage } from '../notifications/alert-formatter';
import {
  generateEmailBody,
  generateSmsBody,
  dispatchAlert as dispatchAlertFn,
} from './threshold-alerts-dispatch';
import type {
  AlertHandler,
  AlertNotification,
  AlertRecipient,
  AlertChannelConfig,
} from './threshold-alerts-types';

// Re-export types so existing callers keep their imports working
export type { AlertHandler, AlertNotification, AlertRecipient, AlertChannelConfig };

export class ThresholdAlerts extends EventEmitter {
  private static instance: ThresholdAlerts;
  private handlers: Map<number, AlertHandler[]> = new Map();
  private recipients: Map<string, AlertRecipient> = new Map(); // licenseKey -> recipient
  private channelConfig: AlertChannelConfig = {
    email: { enabled: true, minThreshold: 80 },
    sms: { enabled: true, minThreshold: 90 },
    telegram: { enabled: true, minThreshold: 80 },
  };
  private initialized: boolean = false;

  private constructor() {
    super();
    this.setupDefaultHandlers();
  }

  static getInstance(): ThresholdAlerts {
    if (!ThresholdAlerts.instance) {
      ThresholdAlerts.instance = new ThresholdAlerts();
    }
    return ThresholdAlerts.instance;
  }

  initialize(): void {
    if (this.initialized) return;

    const emailInitialized = emailService.initialize();
    const smsInitialized = smsService.initialize();
    const telegramInitialized = telegramBotService.initialize();

    logger.info('[ThresholdAlerts] Services initialized:', {
      email: emailInitialized,
      sms: smsInitialized,
      telegram: telegramInitialized,
    });

    if (telegramInitialized) {
      telegramBotService.start().catch((err) => {
        logger.error('[ThresholdAlerts] Failed to start Telegram bot:', { err });
      });
    }

    this.initialized = true;
  }

  private setupDefaultHandlers(): void {
    const meteringService = UsageMeteringService.getInstance();

    meteringService.on('threshold_alert', (alert: ThresholdAlert) => {
      this.emit('alert', alert);

      this.dispatchAlert(alert).catch((err) => {
        logger.error('[ThresholdAlerts] Failed to dispatch alert:', { err });
      });

      const handlers = this.handlers.get(alert.threshold) || [];
      for (const handler of handlers) {
        try {
          handler(alert);
        } catch (error) {
          logger.error('Alert handler error:', { error });
        }
      }
    });
  }

  onThreshold(threshold: number, handler: AlertHandler): void {
    if (!this.handlers.has(threshold)) {
      this.handlers.set(threshold, []);
    }
    this.handlers.get(threshold)!.push(handler);
  }

  onEightyPercent(handler: AlertHandler): void {
    this.onThreshold(80, handler);
  }

  onNinetyPercent(handler: AlertHandler): void {
    this.onThreshold(90, handler);
  }

  onHundredPercent(handler: AlertHandler): void {
    this.onThreshold(100, handler);
  }

  createNotification(alert: ThresholdAlert): AlertNotification {
    const notification: AlertNotification = {
      licenseKey: alert.licenseKey,
      threshold: alert.threshold,
      currentUsage: alert.currentUsage,
      dailyLimit: alert.dailyLimit,
      percentUsed: alert.percentUsed,
      timestamp: alert.timestamp,
    };

    if (alert.threshold === 80) {
      notification.action = 'warn';
    } else if (alert.threshold === 90) {
      notification.action = 'urgent';
    } else if (alert.threshold === 100) {
      notification.action = 'critical';
    }

    return notification;
  }

  async sendEmailNotification(
    alert: ThresholdAlert,
    sendFn: (to: string, subject: string, body: string) => Promise<void>,
    recipient: string,
  ): Promise<void> {
    const notification = this.createNotification(alert);
    const subject = `Usage Alert: ${alert.threshold}% threshold reached`;
    const body = generateEmailBody(notification);
    await sendFn(recipient, subject, body);
  }

  async sendSmsNotification(
    alert: ThresholdAlert,
    sendFn: (to: string, message: string) => Promise<void>,
    recipient: string,
  ): Promise<void> {
    const notification = this.createNotification(alert);
    const message = generateSmsBody(notification);
    await sendFn(recipient, message);
  }

  /** @internal kept for legacy callers; delegates to alert-formatter */
  private getActionMessage(notification: AlertNotification): string {
    return getActionMessage(notification.threshold);
  }

  logAlert(alert: ThresholdAlert): void {
    const notification = this.createNotification(alert);
    logger.info('[THRESHOLD ALERT]', { notification });
  }

  async dispatchAlert(alert: ThresholdAlert): Promise<void> {
    await dispatchAlertFn(alert, this.recipients, this.channelConfig);
  }

  registerRecipient(licenseKey: string, recipient: AlertRecipient): void {
    this.recipients.set(licenseKey, recipient);
    logger.info(`[ThresholdAlerts] Registered recipient for ${licenseKey}`);
  }

  unregisterRecipient(licenseKey: string): void {
    this.recipients.delete(licenseKey);
    logger.info(`[ThresholdAlerts] Unregistered recipient for ${licenseKey}`);
  }

  updateChannelConfig(config: Partial<AlertChannelConfig>): void {
    this.channelConfig = {
      ...this.channelConfig,
      ...config,
      email: { ...this.channelConfig.email, ...config.email },
      sms: { ...this.channelConfig.sms, ...config.sms },
      telegram: { ...this.channelConfig.telegram, ...config.telegram },
    };
    logger.info('[ThresholdAlerts] Updated channel config:', { config: this.channelConfig });
  }
}

export const thresholdAlerts = ThresholdAlerts.getInstance();
