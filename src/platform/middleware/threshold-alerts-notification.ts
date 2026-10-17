import type { ThresholdAlert } from '../metering/usage-metering-service';
import type { AlertNotification } from './threshold-alerts-types';

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
