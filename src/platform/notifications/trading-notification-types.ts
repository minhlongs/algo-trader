/**
 * Trading Notification Types
 * Type definitions for trading, risk, subscription, and payment notification payloads.
 */

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

export type NotificationPayload =
  | { type: 'trade_executed'; payload: TradeExecutedPayload }
  | { type: 'risk_alert'; payload: RiskAlertPayload }
  | { type: 'subscription_change'; payload: SubscriptionChangePayload }
  | { type: 'payment_received'; payload: PaymentReceivedPayload };
