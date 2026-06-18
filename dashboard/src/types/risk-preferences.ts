/**
 * Risk preferences interface and types
 * Centralized state management for user risk settings
 */
export interface RiskPreferences {
  // Auto-close settings
  autoCloseEnabled: boolean;
  maxLossPerTrade: number; // USD
  maxPositionSizePercent: number; // 0-1
  profitTargetPercent: number; // 0-1
  stopLossPercent: number; // 0-1
  trailingStopPercent: number; // 0-1

  // Circuit breaker settings
  circuitBreakerEnabled: boolean;
  maxConsecutiveLosses: number;
  cooldownPeriodMinutes: number;
  maxDrawdownPercent: number; // 0-1

  // Alert preferences
  alertChannels: {
    toast: boolean;
    email: boolean;
    sound: boolean;
  };
  minAlertSeverity: 'low' | 'medium' | 'high' | 'critical';

  // Dashboard layout
  visibleWidgets: string[];
  widgetOrder: string[];

  // Confidence thresholds
  minConfidenceToTrade: number; // 0-1
}

export const DEFAULT_RISK_PREFERENCES: RiskPreferences = {
  autoCloseEnabled: false,
  maxLossPerTrade: 100, // $100 max loss per trade
  maxPositionSizePercent: 0.02, // 2% of portfolio
  profitTargetPercent: 0.05, // 5% profit target
  stopLossPercent: 0.03, // 3% stop loss
  trailingStopPercent: 0.02, // 2% trailing stop

  circuitBreakerEnabled: false,
  maxConsecutiveLosses: 3,
  cooldownPeriodMinutes: 15,
  maxDrawdownPercent: 0.1, // 10% max drawdown

  alertChannels: {
    toast: true,
    email: false,
    sound: false,
  },
  minAlertSeverity: 'medium',

  visibleWidgets: [
    'risk-gauge',
    'exposure-heatmap',
    'pnl-sparkline',
  ],
  widgetOrder: ['risk-gauge', 'exposure-heatmap', 'pnl-sparkline'],

  minConfidenceToTrade: 0.6, // 60% minimum confidence
};
