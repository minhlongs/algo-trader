/**
 * Trading Notification Email Templates
 * Generates HTML and plain text notification emails for trade events, risk alerts,
 * subscription changes, and payment events.
 */

import type { EmailNotification } from './email-service';
import type {
  TradeExecutedPayload,
  RiskAlertPayload,
  SubscriptionChangePayload,
  PaymentReceivedPayload,
} from './trading-notification-types';

export function tradeExecutedEmail(p: TradeExecutedPayload): EmailNotification {
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

export function riskAlertEmail(p: RiskAlertPayload): EmailNotification {
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

export function subscriptionChangeEmail(p: SubscriptionChangePayload): EmailNotification {
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

export function paymentReceivedEmail(p: PaymentReceivedPayload): EmailNotification {
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
