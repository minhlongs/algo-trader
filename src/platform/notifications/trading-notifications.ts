/**
 * Trading Notifications
 * Centralized notification triggers for trade events, risk alerts,
 * subscription changes, and payment received events.
 */

import { emailService } from './email-service';
import { smsService, type SmsNotification } from './sms-service';
import { logger } from '../../shared/utils/logger';
import type {
  TradeExecutedPayload,
  RiskAlertPayload,
  SubscriptionChangePayload,
  PaymentReceivedPayload,
  NotificationPayload,
} from './trading-notification-types';
import {
  tradeExecutedEmail,
  riskAlertEmail,
  subscriptionChangeEmail,
  paymentReceivedEmail,
} from './trading-notification-templates';

// Re-export types
export type {
  TradingNotificationType,
  TradeExecutedPayload,
  RiskAlertPayload,
  SubscriptionChangePayload,
  PaymentReceivedPayload,
  NotificationPayload,
} from './trading-notification-types';

// Re-export email templates
export {
  tradeExecutedEmail,
  riskAlertEmail,
  subscriptionChangeEmail,
  paymentReceivedEmail,
} from './trading-notification-templates';

/* ── public send functions ──────────────────────────────── */

export async function notifyTradeExecuted(payload: TradeExecutedPayload): Promise<void> {
  try {
    const email = tradeExecutedEmail(payload);
    await emailService.send(email);

    if (payload.recipientPhone) {
      const sms: SmsNotification = {
        to: payload.recipientPhone,
        message: `[Trade] ${payload.side.toUpperCase()} ${payload.symbol} @ $${payload.price.toFixed(4)} | P&L: ${payload.pnl >= 0 ? '+' : ''}$${Math.abs(payload.pnl).toFixed(2)}`,
      };
      await smsService.send(sms);
    }
  } catch (error) {
    logger.error('[TradingNotifications] Failed to send trade notification', {
      tenantId: payload.tenantId,
      error,
    });
  }
}

export async function notifyRiskAlert(payload: RiskAlertPayload): Promise<void> {
  try {
    const email = riskAlertEmail(payload);
    await emailService.send(email);

    if (payload.recipientPhone && payload.severity === 'critical') {
      const sms: SmsNotification = {
        to: payload.recipientPhone,
        message: `[RISK ${payload.severity.toUpperCase()}] ${payload.alertType.replace(/_/g, ' ')}: ${payload.message}`,
      };
      await smsService.send(sms);
    }
  } catch (error) {
    logger.error('[TradingNotifications] Failed to send risk alert', {
      tenantId: payload.tenantId,
      error,
    });
  }
}

export async function notifySubscriptionChange(payload: SubscriptionChangePayload): Promise<void> {
  try {
    const email = subscriptionChangeEmail(payload);
    await emailService.send(email);
  } catch (error) {
    logger.error('[TradingNotifications] Failed to send subscription notification', {
      tenantId: payload.tenantId,
      error,
    });
  }
}

export async function notifyPaymentReceived(payload: PaymentReceivedPayload): Promise<void> {
  try {
    const email = paymentReceivedEmail(payload);
    await emailService.send(email);
  } catch (error) {
    logger.error('[TradingNotifications] Failed to send payment notification', {
      tenantId: payload.tenantId,
      error,
    });
  }
}

/* ── unified dispatch ───────────────────────────────────── */

export async function dispatchNotification(event: NotificationPayload): Promise<void> {
  switch (event.type) {
    case 'trade_executed':
      await notifyTradeExecuted(event.payload);
      break;
    case 'risk_alert':
      await notifyRiskAlert(event.payload);
      break;
    case 'subscription_change':
      await notifySubscriptionChange(event.payload);
      break;
    case 'payment_received':
      await notifyPaymentReceived(event.payload);
      break;
  }
}
