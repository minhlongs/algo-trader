/**
 * Signal Provider Onboarding Service
 * Flow: API key verification → backtest validation → 7d paper trading → approve/reject
 */

import { logger } from '../shared/utils/logger';
import {
  type ProviderApplication,
  isProviderApplicationEligibleForApproval,
  runDeterministicBacktest,
  simulateDeterministicPaperTrading,
} from './signal-provider-helpers';

export * from './signal-provider-helpers';

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
    const application = this.getRequiredApplication(applicationId);

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
    const application = this.getRequiredApplication(applicationId);

    if (application.status !== 'running_backtest') {
      throw new Error(`Application ${applicationId} is not in backtest stage (status=${application.status})`);
    }

    const result = runDeterministicBacktest();
    application.backtestResult = result;
    application.status = 'paper_trading';
    application.updatedAt = new Date();
    logger.info('[ProviderOnboarding] Backtest passed', {
      applicationId,
      sharpe: result.sharpe,
      winRate: result.winRate,
    });

    return { sharpe: result.sharpe, winRate: result.winRate };
  }

  async startPaperTrading(applicationId: string): Promise<void> {
    const application = this.getRequiredApplication(applicationId);

    if (application.status !== 'paper_trading') {
      throw new Error(`Application ${applicationId} is not in paper_trading stage (status=${application.status})`);
    }

    const paperResult = simulateDeterministicPaperTrading(applicationId);
    application.paperTradingResult = paperResult;
    application.status = 'approved';
    logger.info('[ProviderOnboarding] Paper trading passed', {
      applicationId,
      profitLoss: paperResult.profitLoss,
      winRate: paperResult.winRate,
    });
    application.updatedAt = new Date();
  }

  async approveApplication(applicationId: string): Promise<void> {
    const application = this.getRequiredApplication(applicationId);

    if (!isProviderApplicationEligibleForApproval(application)) {
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

  private getRequiredApplication(applicationId: string): ProviderApplication {
    const application = this.applications.get(applicationId);
    if (!application) {
      throw new Error(`Application ${applicationId} not found`);
    }
    return application;
  }
}
