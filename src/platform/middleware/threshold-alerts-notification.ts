import type { ThresholdAlert } from '../metering/usage-metering-service';
import type { AlertChannelConfig, AlertHandler, AlertNotification } from './threshold-alerts-types';

export const DEFAULT_ALERT_CHANNEL_CONFIG: AlertChannelConfig = {
  email: { enabled: true, minThreshold: 80 },
  sms: { enabled: true, minThreshold: 90 },
  telegram: { enabled: true, minThreshold: 80 },
};

export function createThresholdNotification(alert: ThresholdAlert): AlertNotification {
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

export function mergeAlertChannelConfig(
  current: AlertChannelConfig,
  update: Partial<AlertChannelConfig>,
): AlertChannelConfig {
  return {
    ...current,
    ...update,
    email: { ...current.email, ...update.email },
    sms: { ...current.sms, ...update.sms },
    telegram: { ...current.telegram, ...update.telegram },
  };
}

export function invokeThresholdHandlers(
  handlers: AlertHandler[] | undefined,
  alert: ThresholdAlert,
  onError: (error: unknown) => void,
): void {
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(alert);
    } catch (error) {
      onError(error);
    }
  }
}
