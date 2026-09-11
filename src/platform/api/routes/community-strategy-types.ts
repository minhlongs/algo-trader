/**
 * Community Strategy Types
 * Shared constants and request body interfaces for community strategy routes.
 */

export const ALLOWED_LANGUAGES = ['typescript', 'javascript'] as const;
export const ALLOWED_STRATEGY_TYPES = ['polymarket', 'cex', 'dex', 'custom'] as const;

export interface UploadStrategyBody {
  tenantId?: string;
  name?: string;
  description?: string;
  strategyType?: string;
  sourceCode?: string;
  language?: string;
}

export interface BacktestRequestBody {
  trades?: import('../../../shared/backtesting/backtest-runner').BacktestTrade[];
  config?: { initialCapitalUsd?: number; riskFreeRateAnnual?: number };
}
