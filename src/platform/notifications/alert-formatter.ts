/**
 * Alert Formatter
 * Shared formatting logic for threshold alerts across all notification channels
 * DRY: Consolidates duplicated formatting from email, SMS, and Telegram services
 */

import {
  type AlertData,
  type FormattedAlert,
  getUrgency,
  getUrgencyColor,
  getEmoji,
  getActionMessage,
  getShortActionMessage,
  getTelegramActionMessage,
  generateTelegramProgressBar,
  getShortKey,
} from './alert-formatter-helpers';

export * from './alert-formatter-helpers';

/**
 * Format complete alert data into unified object
 */
export function formatAlert(data: AlertData): FormattedAlert {
  return {
    urgency: getUrgency(data.threshold),
    urgencyColor: getUrgencyColor(data.threshold),
    emoji: getEmoji(data.threshold),
    shortKey: getShortKey(data.licenseKey),
    actionMessage: getActionMessage(data.threshold),
  };
}

/**
 * Format email subject line
 */
export function formatEmailSubject(threshold: number): string {
  const urgency = getUrgency(threshold);
  return `[${urgency}] Usage Alert: ${threshold}% threshold reached`;
}

/**
 * Format SMS body message
 */
export function formatSmsBody(data: AlertData): string {
  const { urgency, shortKey } = formatAlert(data);
  const action = getShortActionMessage(data.threshold);

  return `ALGO TRADER [${urgency}]
Key: *${shortKey}
Usage: ${data.currentUsage}/${data.dailyLimit} (${data.percentUsed.toFixed(0)}%)
${action}
Reply STOP to opt out`;
}

/**
 * Format Telegram message body (Markdown)
 */
export function formatTelegramMessage(data: AlertData): string {
  const { emoji, urgency, shortKey } = formatAlert(data);
  const progressBar = generateTelegramProgressBar(data.percentUsed);
  const actionMessage = getTelegramActionMessage(data.threshold);

  return `
${emoji} *${urgency} - Usage Alert*

Key: \`${shortKey}\`
Threshold: ${data.threshold}%
Usage: ${data.currentUsage.toLocaleString()} / ${data.dailyLimit.toLocaleString()}
Progress: ${progressBar} ${data.percentUsed.toFixed(0)}%

${actionMessage}
  `.trim();
}
