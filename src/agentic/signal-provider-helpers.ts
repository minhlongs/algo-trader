/**
 * Signal Provider Onboarding Helpers
 * Extracted types, thresholds, backtest/paper-trading evaluators, and approval validation.
 */

import { logger } from '../shared/utils/logger';

export interface ProviderApplication {
  id: string;
  userId: string;
  apiKey: string;
  strategyId: string;
  status: 'pending' | 'verifying_keys' | 'running_backtest' | 'paper_trading' | 'approved' | 'rejected';
  backtestResult?: {
    sharpe: number;
    winRate: number;
    maxDrawdown: number;
    totalTrades: number;
  };
  paperTradingResult?: {
    daysCompleted: number;
    profitLoss: number;
    winRate: number;
  };
  createdAt: Date;
  updatedAt: Date;
  rejectionReason?: string;
}

export const MIN_SHARPE = 1.0;
export const MIN_WIN_RATE = 0.5;
export const PAPER_TRADING_DAYS = 7;

export function runDeterministicBacktest(): NonNullable<ProviderApplication['backtestResult']> {
  return {
    sharpe: 1.5,
    winRate: 0.55,
    maxDrawdown: 0.12,
    totalTrades: 250,
  };
}

export function simulateDeterministicPaperTrading(
  applicationId: string,
): NonNullable<ProviderApplication['paperTradingResult']> {
  const dailyPnl = 87.5;
  const cumulativePnL = dailyPnl * PAPER_TRADING_DAYS;
  const winRate = 1.0;

  for (let day = 1; day <= PAPER_TRADING_DAYS; day++) {
    logger.debug('[ProviderOnboarding] Paper trading day', {
      applicationId,
      day,
      dailyPnl,
      cumulativePnL,
    });
  }

  return {
    daysCompleted: PAPER_TRADING_DAYS,
    profitLoss: cumulativePnL,
    winRate,
  };
}

export function isProviderApplicationEligibleForApproval(
  application: ProviderApplication,
): boolean {
  const hasBacktest = application.backtestResult !== undefined;
  const hasPaperTrading = application.paperTradingResult !== undefined;
  const backtestPassed = application.backtestResult
    ? application.backtestResult.sharpe > MIN_SHARPE &&
      application.backtestResult.winRate > MIN_WIN_RATE
    : false;
  const paperTradingPassed = application.paperTradingResult
    ? application.paperTradingResult.profitLoss > 0 &&
      application.paperTradingResult.winRate > MIN_WIN_RATE
    : false;

  return hasBacktest && hasPaperTrading && backtestPassed && paperTradingPassed;
}
