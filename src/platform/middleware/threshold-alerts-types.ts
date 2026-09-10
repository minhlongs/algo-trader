/**
 * Threshold Alerts — shared type definitions
 * Extracted from threshold-alerts.ts for modularization
 */

import type { ThresholdAlert } from '../metering/usage-metering-service';

export interface AlertHandler {
  (alert: ThresholdAlert): Promise<void> | void;
}

export interface AlertNotification {
  licenseKey: string;
  threshold: number;
  currentUsage: number;
  dailyLimit: number;
  percentUsed: number;
  timestamp: string;
  action?: string;
}

export interface AlertRecipient {
  email?: string;
  phone?: string;
  telegramChatId?: number;
}

export interface AlertChannelConfig {
  email: {
    enabled: boolean;
    minThreshold: number; // 80 = send at 80%+
  };
  sms: {
    enabled: boolean;
    minThreshold: number; // 90 = only send at 90%+
  };
  telegram: {
    enabled: boolean;
    minThreshold: number; // 80 = send at 80%+
  };
}
