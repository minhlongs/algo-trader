/**
 * Trading Notification Types
 * Centralized notification triggers for trade events, risk alerts,
 * subscription changes, and payment received events.
 */

import { emailService, type EmailNotification } from './email-service';
import { smsService, type SmsNotification } from './sms-service';
import { logger } from '../../shared/utils/logger';

/* ── notification type definitions ──────────────────────── */

export type TradingNotificationType =
  | 'trade_executed'
  | 'risk_alert'
  | 'subscription_change'
  | 'payment_received';

export interface TradeExecutedPayload {
  tenantId: string;
  recipientEmail: string;
  recipientPhone?: string;
  strategy: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  pnl: number;
  exchange: string;
}

export interface RiskAlertPayload {
  tenantId: string;
  recipientEmail: string;
  recipientPhone?: string;
  alertType: 'drawdown' | 'position_limit' | 'loss_limit' | 'correlation' | 'var_breach';
  severity: 'warning' | 'critical';
  message: string;
  currentValue?: number;
  thresholdValue?: number;
}

export interface SubscriptionChangePayload {
  tenantId: string;
  recipientEmail: string;
  changeType: 'upgraded' | 'downgraded' | 'canceled' | 'expired' | 'renewed';
  oldTier?: string;
  newTier?: string;
  effectiveDate: string;
}

export interface PaymentReceivedPayload {
  tenantId: string;
  recipientEmail: string;
  amount: number;
  currency: string;
  invoiceId: string;
  tier: string;
  paymentMethod: string;
  transactionId?: string;
}

/* ── email templates ────────────────────────────────────── */

function tradeExecutedEmail(p: TradeExecutedPayload): EmailNotification {
  const pnlSign = p.pnl >= 0 ? '+' : '';
  const pnlColor = p.pnl >= 0 ? '#22c55e' : '#ef4444';

  return {
    to: p.recipientEmail,
    subject: `[Trade] ${p.side.toUpperCase()} ${p.symbol} on ${p.exchange} — P&L: ${pnlSign}$${Math.abs(p.pnl).toFixed(2)}`,
    body: [
      `Trade Executed`,
      `Strategy: ${p.strategy}`,
      `Symbol: ${p.symbol}`,
      `Side: ${p.side.toUpperCase()}`,
      `Price: $${p.price.toFixed(4)}`,
      `Quantity: ${p.quantity}`,
      `P&L: ${pnlSign}$${Math.abs(p.pnl).toFixed(2)}`,
      `Exchange: ${p.exchange}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:${pnlColor};color:white;padding:15px;border-radius:5px 5px 0 0">
    <h2 style="margin:0">Trade Executed — ${p.side.toUpperCase()} ${p.symbol}</h2>
  </div>
  <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6">
    <p><strong>Strategy:</strong> ${p.strategy}</p>
    <p><strong>Exchange:</strong> ${p.exchange}</p>
    <p><strong>Price:</strong> $${p.price.toFixed(4)}</p>
    <p><strong>Quantity:</strong> ${p.quantity}</p>
    <p style="font-size:1.2em"><strong>P&L: <span style="color:${pnlColor}">${pnlSign}$${Math.abs(p.pnl).toFixed(2)}</span></strong></p>
    <p style="color:#6c757d;font-size:0.9em">${new Date().toISOString()}</p>
  </div>
</body></html>`.trim(),
  };
}

function riskAlertEmail(p: RiskAlertPayload): EmailNotification {
  const sevColor = p.severity === 'critical' ? '#ef4444' : '#f59e0b';
  const title = `Risk Alert [${p.severity.toUpperCase()}] — ${p.alertType.replace(/_/g, ' ')}`;

  return {
    to: p.recipientEmail,
    subject: title,
    body: [
      title,
      p.message,
      p.currentValue !== undefined ? `Current: ${p.currentValue}` : '',
      p.thresholdValue !== undefined ? `Threshold: ${p.thresholdValue}` : '',
      `Time: ${new Date().toISOString()}`,
    ].filter(Boolean).join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:${sevColor};color:white;padding:15px;border-radius:5px 5px 0 0">
    <h2 style="margin:0">${title}</h2>
  </div>
  <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6">
    <p>${p.message}</p>
    ${p.currentValue !== undefined ? `<p><strong>Current Value:</strong> ${p.currentValue}</p>` : ''}
    ${p.thresholdValue !== undefined ? `<p><strong>Threshold:</strong> ${p.thresholdValue}</p>` : ''}
    <p style="color:#6c757d;font-size:0.9em">${new Date().toISOString()}</p>
  </div>
</body></html>`.trim(),
  };
}

function subscriptionChangeEmail(p: SubscriptionChangePayload): EmailNotification {
  const changeLabel = {
    upgraded: 'Upgraded',
    downgraded: 'Downgraded',
    canceled: 'Canceled',
    expired: 'Expired',
    renewed: 'Renewed',
  }[p.changeType];

  return {
    to: p.recipientEmail,
    subject: `[Subscription] ${changeLabel} — ${p.newTier ?? p.changeType}`,
    body: [
      `Subscription ${changeLabel}`,
      p.oldTier ? `Previous Tier: ${p.oldTier}` : '',
      p.newTier ? `New Tier: ${p.newTier}` : '',
      `Effective: ${p.effectiveDate}`,
    ].filter(Boolean).join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#06b6d4;color:white;padding:15px;border-radius:5px 5px 0 0">
    <h2 style="margin:0">Subscription ${changeLabel}</h2>
  </div>
  <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6">
    ${p.oldTier ? `<p><strong>Previous Tier:</strong> ${p.oldTier}</p>` : ''}
    ${p.newTier ? `<p><strong>New Tier:</strong> ${p.newTier}</p>` : ''}
    <p><strong>Effective Date:</strong> ${p.effectiveDate}</p>
  </div>
</body></html>`.trim(),
  };
}

function paymentReceivedEmail(p: PaymentReceivedPayload): EmailNotification {
  return {
    to: p.recipientEmail,
    subject: `[Payment] Received $${p.amount.toFixed(2)} ${p.currency.toUpperCase()} — ${p.tier} tier`,
    body: [
      `Payment Received`,
      `Amount: $${p.amount.toFixed(2)} ${p.currency.toUpperCase()}`,
      `Tier: ${p.tier}`,
      `Invoice: ${p.invoiceId}`,
      `Method: ${p.paymentMethod}`,
      p.transactionId ? `Transaction: ${p.transactionId}` : '',
    ].filter(Boolean).join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#22c55e;color:white;padding:15px;border-radius:5px 5px 0 0">
    <h2 style="margin:0">Payment Received — $${p.amount.toFixed(2)}</h2>
  </div>
  <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6">
    <p><strong>Amount:</strong> $${p.amount.toFixed(2)} ${p.currency.toUpperCase()}</p>
    <p><strong>Tier:</strong> ${p.tier}</p>
    <p><strong>Invoice:</strong> ${p.invoiceId}</p>
    <p><strong>Method:</strong> ${p.paymentMethod}</p>
    ${p.transactionId ? `<p><strong>Transaction ID:</strong> ${p.transactionId}</p>` : ''}
  </div>
</body></html>`.trim(),
  };
}

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

export type NotificationPayload =
  | { type: 'trade_executed'; payload: TradeExecutedPayload }
  | { type: 'risk_alert'; payload: RiskAlertPayload }
  | { type: 'subscription_change'; payload: SubscriptionChangePayload }
  | { type: 'payment_received'; payload: PaymentReceivedPayload };

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
