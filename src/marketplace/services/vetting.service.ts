/**
 * Vetting Service - Strategy approval workflow
 * Manages vetting queue, automated checks, and status transitions
 */

import { logger } from '../../shared/utils/logger';
import { AuditLogService } from '../../audit/audit-log-service';
import { StrategyRepository, VettingJobRepository } from './repositories';

import type { StrategyStatus, BacktestSummary } from '../models/types';

import type { IMarketplaceStrategy } from '../models/types';

export interface VettingResult {
  approved: boolean;
  score: number;
  feedback: string;
  checks: VettingCheck[];
}

export interface VettingCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export class VettingService {
  private static instance: VettingService;
  private strategyRepo: StrategyRepository;
  private vettingRepo: VettingJobRepository;
  private auditService: AuditLogService;

  constructor(
    strategyRepo?: StrategyRepository,
    vettingRepo?: VettingJobRepository,
  ) {
    this.strategyRepo = strategyRepo || new StrategyRepository();
    this.vettingRepo = vettingRepo || new VettingJobRepository();
    this.auditService = AuditLogService.getInstance();
  }

  static getInstance(
    strategyRepo?: StrategyRepository,
    vettingRepo?: VettingJobRepository,
  ): VettingService {
    if (!VettingService.instance) {
      VettingService.instance = new VettingService(strategyRepo, vettingRepo);
    }
    return VettingService.instance;
  }

  async submitForVetting(strategyId: string, tenantId: string): Promise<{ id: string; strategyId: string; decision: string }> {
    try {
      const strategy = await this.strategyRepo.findById(strategyId);
      if (!strategy) throw new Error('Strategy not found');
      if (strategy.status !== 'draft') {
        throw new Error(`Cannot submit strategy with status: ${strategy.status}`);
      }
      await this.strategyRepo.updateStatus(strategyId, 'pending_vetting');
      const job = await this.vettingRepo.create({ strategyId, adminId: 'system', decision: 'queued' });
      logger.info('Strategy submitted for vetting', { strategyId, jobId: job.id });
      return { id: String(job.id), strategyId: job.strategyId, decision: job.decision };
    } catch (err) {
      logger.error('Failed to submit for vetting', { strategyId, error: err });
      throw err;
    }
  }

  async approveStrategy(strategyId: string, adminId: string, notes?: string): Promise<IMarketplaceStrategy | null> {
    try {
      const strategy = await this.strategyRepo.findById(strategyId);
      if (!strategy) throw new Error('Strategy not found');
      if (strategy.status !== 'pending_vetting') {
        throw new Error(`Cannot approve strategy with status: ${strategy.status}`);
      }
      const updated = await this.strategyRepo.updateStatus(strategyId, 'approved');
      await this.auditService.log(strategyId, 'activated', {
        metadata: { adminId, action: 'strategy_approved', notes },
      });
      logger.info('Strategy approved', { strategyId, adminId });
      return updated;
    } catch (err) {
      logger.error('Failed to approve strategy', { strategyId, error: err });
      throw err;
    }
  }

  async rejectStrategy(strategyId: string, adminId: string, reason: string): Promise<IMarketplaceStrategy | null> {
    try {
      const strategy = await this.strategyRepo.findById(strategyId);
      if (!strategy) throw new Error('Strategy not found');
      if (strategy.status !== 'pending_vetting') {
        throw new Error(`Cannot reject strategy with status: ${strategy.status}`);
      }
      const updated = await this.strategyRepo.update(strategyId, {
        status: 'rejected',
        rejectionReason: reason,
      } as Partial<IMarketplaceStrategy>);
      await this.auditService.log(strategyId, 'suspended', {
        metadata: { adminId, action: 'strategy_rejected', reason },
      });
      logger.info('Strategy rejected', { strategyId, adminId, reason });
      return updated;
    } catch (err) {
      logger.error('Failed to reject strategy', { strategyId, error: err });
      throw err;
    }
  }

  async recordDecision(
    id: string,
    approved: boolean,
    adminUserId: string,
    notes?: string,
  ): Promise<IMarketplaceStrategy | null> {
    if (approved) {
      return this.approveStrategy(id, adminUserId, notes);
    }
    return this.rejectStrategy(id, adminUserId, notes || 'Rejected');
  }

  async requestChanges(strategyId: string, adminId: string, notes: string): Promise<IMarketplaceStrategy | null> {
    try {
      const strategy = await this.strategyRepo.findById(strategyId);
      if (!strategy) throw new Error('Strategy not found');
      if (strategy.status !== 'pending_vetting') {
        throw new Error(`Cannot request changes for strategy with status: ${strategy.status}`);
      }
      const updated = await this.strategyRepo.updateStatus(strategyId, 'draft');
      await this.auditService.log(strategyId, 'rate_limit', {
        metadata: { adminId, action: 'changes_requested', notes },
      });
      logger.info('Changes requested', { strategyId, adminId, notes });
      return updated;
    } catch (err) {
      logger.error('Failed to request changes', { strategyId, error: err });
      throw err;
    }
  }

  async getVettingHistory(strategyId: string): Promise<{ id: string; strategyId: string; status: string; createdAt: string; completedAt?: string; result?: { approved: boolean; score: number; feedback: string } }[]> {
    const records = await this.vettingRepo.findByStrategyId(strategyId);
    return records.map((r: any) => ({
      id: String(r.id),
      strategyId: r.strategyId,
      status: r.decision,
      createdAt: r.createdAt.toISOString(),
      completedAt: undefined,
      result: undefined,
    }));
  }

  async getPendingStrategies(filters?: {
    category?: string;
    creatorId?: string;
    limit?: number;
  }): Promise<IMarketplaceStrategy[]> {
    return this.strategyRepo.findByStatus('pending_vetting', filters);
  }

  async runVettingChecks(strategyId: string): Promise<VettingResult> {
    try {
      const strategy = await this.strategyRepo.findById(strategyId);
      if (!strategy) throw new Error('Strategy not found');

      const checks: VettingCheck[] = [];
      let score = 100;

      // Sharpe ratio check (>= 1.0)
      const sharpeCheck = this.checkMetric(
        'Sharpe Ratio',
        strategy.backtestSummary?.sharpe,
        1.0,
        (v) => v >= 1.0,
        strategy.backtestSummary?.sharpe?.toFixed(2) || 'N/A'
      );
      checks.push(sharpeCheck.check);
      if (!sharpeCheck.check.passed) score -= 30;

      // Max drawdown check (<= 20%)
      const ddCheck = this.checkMetric(
        'Max Drawdown',
        strategy.backtestSummary?.maxDrawdown,
        20,
        (v) => v <= 20,
        `${strategy.backtestSummary?.maxDrawdown?.toFixed(1)}%`
      );
      checks.push(ddCheck.check);
      if (!ddCheck.check.passed) score -= 30;

      // Win rate check (>= 45%)
      const wrCheck = this.checkMetric(
        'Win Rate',
        strategy.backtestSummary?.winRate,
        45,
        (v) => v >= 45,
        `${strategy.backtestSummary?.winRate?.toFixed(1)}%`
      );
      checks.push(wrCheck.check);
      if (!wrCheck.check.passed) score -= 25;

      // Period check (>= 90 days)
      const periodCheck = this.checkMetric(
        'Backtest Period',
        strategy.backtestSummary?.periodDays,
        90,
        (v) => v >= 90,
        `${strategy.backtestSummary?.periodDays || 0} days`
      );
      checks.push(periodCheck.check);
      if (!periodCheck.check.passed) score -= 15;

      const approved = checks.every((c) => c.passed);
      const feedback = checks
        .filter((c) => !c.passed)
        .map((c) => `${c.name}: ${c.detail}`)
        .join('; ') || 'All checks passed';

      logger.info('Vetting checks completed', { strategyId, approved, score });
      return { approved, score, feedback, checks };
    } catch (err) {
      logger.error('Failed to run vetting checks', { strategyId, error: err });
      throw err;
    }
  }

  private checkMetric<T>(
    name: string,
    value: T | undefined,
    threshold: number,
    predicate: (v: number) => boolean,
    displayValue: string
  ): { check: VettingCheck } {
    const passed = value !== undefined && predicate(value as number);
    return {
      check: {
        name,
        passed,
        detail: passed
          ? `${displayValue} meets threshold`
          : `${displayValue} does not meet threshold`,
      },
    };
  }
}
