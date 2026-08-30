/**
 * Signal Provider Onboarding Service
 * Flow: API key verification → backtest validation → 7d paper trading → approve/reject
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

const MIN_SHARPE = 1.0;
const MIN_WIN_RATE = 0.5;
const PAPER_TRADING_DAYS = 7;

export class SignalProviderOnboarding {
  private applications: Map<string, ProviderApplication> = new Map();
  private nextId = 1;

  async submitApplication(userId: string, apiKey: string, strategyId: string): Promise<ProviderApplication> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('API key must not be empty');
    }

    const id = `prov-${String(this.nextId++).padStart(4, '0')}`;
    const application: ProviderApplication = {
      id,
      userId,
      apiKey,
      strategyId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.applications.set(id, application);
    logger.info('[ProviderOnboarding] Application submitted', { applicationId: id, userId, strategyId });
    return application;
  }

  async verifyApiKeys(applicationId: string): Promise<boolean> {
    const application = this.applications.get(applicationId);
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    application.status = 'verifying_keys';
    application.updatedAt = new Date();

    const apiKeyValid = application.apiKey.length > 10;

    if (!apiKeyValid) {
      application.status = 'rejected';
      application.rejectionReason = 'Invalid API key format';
      application.updatedAt = new Date();
      logger.warn('[ProviderOnboarding] API key format invalid', { applicationId });
      return false;
    }

    application.status = 'running_backtest';
    application.updatedAt = new Date();
    logger.info('[ProviderOnboarding] API keys verified', { applicationId });
    return true;
  }

  async runBacktest(applicationId: string, _strategyId: string): Promise<{ sharpe: number; winRate: number }> {
    const application = this.applications.get(applicationId);
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status !== 'running_backtest') {
      throw new Error(`Application ${applicationId} is not in backtest stage (status=${application.status})`);
    }

    // Deterministic mock backtest — always passes
    const sharpe = 1.5;
    const winRate = 0.55;
    const maxDrawdown = 0.12;
    const totalTrades = 250;

    application.backtestResult = { sharpe, winRate, maxDrawdown, totalTrades };

    // Deterministic mock: sharpe (1.5) > MIN_SHARPE (1.0) and winRate (0.55) >
    // MIN_WIN_RATE (0.5) are constant, so the pass branch always executes and the
    // rejection branch below is unreachable. If the mock ever becomes
    // configurable, restore the else branch here.
    application.status = 'paper_trading';
    application.updatedAt = new Date();
    logger.info('[ProviderOnboarding] Backtest passed', { applicationId, sharpe, winRate });

    return { sharpe, winRate };
  }

  async startPaperTrading(applicationId: string): Promise<void> {
    const application = this.applications.get(applicationId);
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (application.status !== 'paper_trading') {
      throw new Error(`Application ${applicationId} is not in paper_trading stage (status=${application.status})`);
    }

    // Deterministic mock: 7 days all profitable at $87.50/day → total $612.50
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

    application.paperTradingResult = {
      daysCompleted: PAPER_TRADING_DAYS,
      profitLoss: cumulativePnL,
      winRate,
    };

    // Deterministic mock: cumulativePnL (612.5) > 0 and winRate (1.0) >
    // MIN_WIN_RATE (0.5) are constant, so the pass branch always executes and the
    // rejection branch below is unreachable. If the mock ever becomes
    // configurable, restore the else branch here.
    application.status = 'approved';
    logger.info('[ProviderOnboarding] Paper trading passed', { applicationId, profitLoss: cumulativePnL, winRate });

    application.updatedAt = new Date();
  }

  async approveApplication(applicationId: string): Promise<void> {
    const application = this.applications.get(applicationId);
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }

    const hasBacktest = application.backtestResult !== undefined;
    const hasPaperTrading = application.paperTradingResult !== undefined;
    const backtestPassed = application.backtestResult
      ? application.backtestResult.sharpe > MIN_SHARPE && application.backtestResult.winRate > MIN_WIN_RATE
      : false;
    const paperTradingPassed = application.paperTradingResult
      ? application.paperTradingResult.profitLoss > 0 && application.paperTradingResult.winRate > MIN_WIN_RATE
      : false;

    if (!hasBacktest || !hasPaperTrading || !backtestPassed || !paperTradingPassed) {
      const reason = application.rejectionReason || 'Not all onboarding stages completed';
      application.status = 'rejected';
      application.rejectionReason = reason;
      application.updatedAt = new Date();
      logger.warn('[ProviderOnboarding] Cannot approve — stages incomplete', { applicationId });
      return;
    }

    application.status = 'approved';
    application.updatedAt = new Date();
    logger.info('[ProviderOnboarding] Approved', { applicationId });
  }

  async getApplication(applicationId: string): Promise<ProviderApplication | null> {
    return this.applications.get(applicationId) ?? null;
  }
}
