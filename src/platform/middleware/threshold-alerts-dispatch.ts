/**
 * Threshold Alerts — dispatch helpers
 * Standalone notification body generators and multi-channel dispatch logic.
 * Extracted from threshold-alerts.ts for modularization.
 */

import { logger } from '../../shared/utils/logger';
import type { ThresholdAlert } from '../metering/usage-metering-service';
import { emailService } from '../notifications/email-service';
import { smsService } from '../notifications/sms-service';
import { telegramBotService } from '../telegram/bot';
import { formatAlert, getActionMessage } from '../notifications/alert-formatter';
import type { AlertNotification, AlertRecipient, AlertChannelConfig } from './threshold-alerts-types';

export function generateEmailBody(notification: AlertNotification): string {
  const { urgency } = formatAlert({
    licenseKey: notification.licenseKey,
    threshold: notification.threshold,
    currentUsage: notification.currentUsage,
    dailyLimit: notification.dailyLimit,
    percentUsed: notification.percentUsed,
  });
  const actionMessage = getActionMessage(notification.threshold);

  return `
USAGE THRESHOLD ALERT [${urgency}]

License Key: ${notification.licenseKey}
Threshold Reached: ${notification.threshold}%
Current Usage: ${notification.currentUsage.toLocaleString()} calls
Daily Limit: ${notification.dailyLimit.toLocaleString()} calls
Percent Used: ${notification.percentUsed.toFixed(1)}%
Time: ${notification.timestamp}

${actionMessage}

Please review your usage and consider upgrading your tier if needed.
  `.trim();
}

export function generateSmsBody(notification: AlertNotification): string {
  const { urgency } = formatAlert({
    licenseKey: notification.licenseKey,
    threshold: notification.threshold,
    currentUsage: notification.currentUsage,
    dailyLimit: notification.dailyLimit,
    percentUsed: notification.percentUsed,
  });

  return `USAGE ALERT: ${notification.threshold}% reached. ${notification.currentUsage}/${notification.dailyLimit} calls. ${urgency}`;
}

export async function dispatchAlert(
  alert: ThresholdAlert,
  recipients: Map<string, AlertRecipient>,
  channelConfig: AlertChannelConfig,
): Promise<void> {
  const recipient = recipients.get(alert.licenseKey);
  if (!recipient) {
    logger.info(`[ThresholdAlerts] No recipient found for ${alert.licenseKey}`);
    return;
  }

  const promises: Promise<boolean>[] = [];

  // Email notification
  if (
    channelConfig.email.enabled &&
    alert.threshold >= channelConfig.email.minThreshold &&
    recipient.email
  ) {
    promises.push(
      emailService.sendThresholdAlert(
        recipient.email,
        alert.licenseKey,
        alert.threshold,
        alert.currentUsage,
        alert.dailyLimit,
        alert.percentUsed,
      ),
    );
  }

  // SMS notification (only for critical thresholds)
  if (
    channelConfig.sms.enabled &&
    alert.threshold >= channelConfig.sms.minThreshold &&
    recipient.phone
  ) {
    promises.push(
      smsService.sendThresholdAlert(
        recipient.phone,
        alert.licenseKey,
        alert.threshold,
        alert.currentUsage,
        alert.dailyLimit,
        alert.percentUsed,
      ),
    );
  }

  // Telegram notification
  if (
    channelConfig.telegram.enabled &&
    alert.threshold >= channelConfig.telegram.minThreshold &&
    recipient.telegramChatId
  ) {
    promises.push(
      telegramBotService.sendThresholdAlert(
        recipient.telegramChatId,
        alert.licenseKey,
        alert.threshold,
        alert.currentUsage,
        alert.dailyLimit,
        alert.percentUsed,
      ),
    );
  }

  const results = await Promise.allSettled(promises);
  const successCount = results.filter(
    (r) => r.status === 'fulfilled' && r.value === true,
  ).length;

  logger.info(
    `[ThresholdAlerts] Dispatched ${successCount}/${results.length} notifications for ${alert.licenseKey} at ${alert.threshold}%`,
  );
}
