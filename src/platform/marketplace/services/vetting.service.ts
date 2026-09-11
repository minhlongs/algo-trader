/**
 * Vetting Service - Strategy approval workflow
 * Manages vetting queue, automated checks, and status transitions.
 * Delegates quantitative evaluation to vetting-rules-engine.
 */

import { logger } from '../../../shared/utils/logger';
import { AuditLogService } from '../../audit/audit-log-service';
import { StrategyRepository, VettingJobRepository } from './repositories';
import type { VettingJobRecord } from '../repositories/vetting-job-repository';
import type { IMarketplaceStrategy } from '../models/types';
import { evaluateStrategyBacktest } from './vetting-rules-engine';

export type { VettingResult, VettingCheck } from './vetting-types';
export { evaluateStrategyBacktest } from './vetting-rules-engine';

export class VettingService {
  private static instance: VettingService;
  private strategyRepo: StrategyRepository;
  private vettingRepo: VettingJobRepository;
  private auditService: AuditLogService;

  constructor(strategyRepo?: StrategyRepository, vettingRepo?: VettingJobRepository) {
    this.strategyRepo = strategyRepo || new StrategyRepository();
    this.vettingRepo = vettingRepo || new VettingJobRepository();
    this.auditService = AuditLogService.getInstance();
  }

  static getInstance(strategyRepo?: StrategyRepository, vettingRepo?: VettingJobRepository): VettingService {
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
      await this.auditService.log(strategyId, 'activated', { metadata: { adminId, action: 'strategy_approved', notes } });
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
      const updated = await this.strategyRepo.update(strategyId, { status: 'rejected', rejectionReason: reason } as Partial<IMarketplaceStrategy>);
      await this.auditService.log(strategyId, 'suspended', { metadata: { adminId, action: 'strategy_rejected', reason } });
      logger.info('Strategy rejected', { strategyId, adminId, reason });
      return updated;
    } catch (err) {
      logger.error('Failed to reject strategy', { strategyId, error: err });
      throw err;
    }
  }

  async recordDecision(id: string, approved: boolean, adminUserId: string, notes?: string): Promise<IMarketplaceStrategy | null> {
    if (approved) return this.approveStrategy(id, adminUserId, notes);
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
      await this.auditService.log(strategyId, 'rate_limit', { metadata: { adminId, action: 'changes_requested', notes } });
      logger.info('Changes requested', { strategyId, adminId, notes });
      return updated;
    } catch (err) {
      logger.error('Failed to request changes', { strategyId, error: err });
      throw err;
    }
  }

  async getVettingHistory(strategyId: string): Promise<{ id: string; strategyId: string; status: string; createdAt: string; completedAt?: string; result?: { approved: boolean; score: number; feedback: string } }[]> {
    const records = await this.vettingRepo.findByStrategyId(strategyId);
    return records.map((r: VettingJobRecord) => ({
      id: String(r.id),
      strategyId: r.strategyId,
      status: r.decision,
      createdAt: r.createdAt.toISOString(),
      completedAt: undefined,
      result: undefined,
    }));
  }

  async getPendingStrategies(filters?: { category?: string; creatorId?: string; limit?: number }): Promise<IMarketplaceStrategy[]> {
    return this.strategyRepo.findByStatus('pending_vetting', filters);
  }

  async runVettingChecks(strategyId: string): Promise<import('./vetting-types').VettingResult> {
    try {
      const strategy = await this.strategyRepo.findById(strategyId);
      if (!strategy) throw new Error('Strategy not found');
      const result = evaluateStrategyBacktest(strategy.backtestSummary);
      logger.info('Vetting checks completed', { strategyId, approved: result.approved, score: result.score });
      return result;
    } catch (err) {
      logger.error('Failed to run vetting checks', { strategyId, error: err });
      throw err;
    }
  }
}
