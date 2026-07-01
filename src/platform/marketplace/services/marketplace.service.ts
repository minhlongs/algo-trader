/**
 * Marketplace Service - Core strategy and listing lifecycle
 * DB-backed singleton, composes repositories
 */

import { logger } from '../../../shared/utils/logger';
import { AuditLogService } from '../../audit/audit-log-service';
import {
  StrategyRepository, strategyRepository,
  ListingRepository, listingRepository,
  VettingJobRepository, vettingJobRepository,
  ReviewRepository, reviewRepository,
  PerformanceRepository, performanceRepository,
} from './repositories';
import { NotificationService } from '../notifications/notification-service';
import { VettingWorker } from '../workers/vetting-worker';
import type {
  IMarketplaceStrategy, IMarketplaceListing, StrategyCategory, StrategyStatus,
  BacktestSummary, PaginatedResult, PaginationParams, SortOrder, SortField,
  IMarketplaceReview, IMarketplacePerformance,
} from '../models/types';

export class MarketplaceService {
  private static instance: MarketplaceService;
  private strategyRepo: StrategyRepository;
  private listingRepo: ListingRepository;
  private vettingRepo: VettingJobRepository;
  private reviewRepo: ReviewRepository;
  private perfRepo: PerformanceRepository;
  private auditService: AuditLogService;
  private notificationService: NotificationService;
  private vettingWorker: VettingWorker;

  private constructor() {
    this.strategyRepo = strategyRepository;
    this.listingRepo = listingRepository;
    this.vettingRepo = vettingJobRepository;
    this.reviewRepo = reviewRepository;
    this.perfRepo = performanceRepository;
    this.auditService = AuditLogService.getInstance();
    this.notificationService = NotificationService.getInstance();
    this.vettingWorker = VettingWorker.getInstance();
  }

  static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) MarketplaceService.instance = new MarketplaceService();
    return MarketplaceService.instance;
  }

  // ── Strategy CRUD ──────────────────────────────────────────────

  async createStrategy(data: { id: string; tenantId: string; creatorId: string; name: string; description: string; category: StrategyCategory; riskLevel: number; minAllocationUsd: number; maxAllocationUsd: number; supportedExchanges: string[]; tags: string[]; backtestSummary?: BacktestSummary; }): Promise<IMarketplaceStrategy> {
    const strategy = await this.strategyRepo.create({
      ...data, status: 'draft',
      supportedExchanges: data.supportedExchanges,
      tags: data.tags,
    });
    logger.info('Strategy created', { strategyId: strategy.id });
    return strategy;
  }

  async getStrategy(id: string): Promise<IMarketplaceStrategy | null> {
    return this.strategyRepo.findById(id);
  }

  async getStrategyWithDetails(id: string): Promise<{ strategy: IMarketplaceStrategy; performance?: IMarketplacePerformance; reviews: IMarketplaceReview[]; } | null> {
    const strategy = await this.strategyRepo.findById(id);
    if (!strategy) return null;
    const [performance, reviews] = await Promise.all([
      this.perfRepo.getLatestByStrategy(id, 1),
      this.reviewRepo.findAll({ strategyId: id }),
    ]);
    return {
      strategy,
      performance: performance[0] || undefined,
      reviews: reviews.data,
    };
  }

  async updateStrategy(id: string, updates: Partial<IMarketplaceStrategy>): Promise<IMarketplaceStrategy | null> {
    const existing = await this.strategyRepo.findById(id);
    if (!existing || existing.status !== 'draft') return existing;
    const updated = await this.strategyRepo.update(id, updates);
    logger.info('Strategy updated', { strategyId: id });
    return updated;
  }

  async updateStrategyStatus(id: string, status: StrategyStatus): Promise<IMarketplaceStrategy | null> {
    const updated = await this.strategyRepo.updateStatus(id, status);
    logger.info('Strategy status changed', { strategyId: id, status });
    return updated;
  }

  async listStrategies(filters?: { author?: string; minRating?: number; status?: string; category?: string; riskLevel?: number; minSharpe?: number; maxDrawdown?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; page?: number; limit?: number; search?: string; }): Promise<PaginatedResult<IMarketplaceStrategy>> {
    const strategyFilters: Record<string, unknown> = {};
    if (filters?.status) strategyFilters.status = filters.status;
    if (filters?.category) strategyFilters.category = filters.category;
    if (filters?.search) strategyFilters.search = filters.search;
    if (filters?.riskLevel) strategyFilters.riskLevel = filters.riskLevel;

    const result = await this.strategyRepo.findAll(
      strategyFilters,
      { page: filters?.page ?? 1, limit: filters?.limit ?? 20 },
      { field: filters?.sortBy ?? 'created_at', order: filters?.sortOrder ?? 'desc' },
    );

    // Batch-fetch listings to include price data in strategy response
    if (result.data.length > 0) {
      const strategyIds = result.data.map((s) => s.id);
      const listings = await this.listingRepo.findByStrategyIds(strategyIds);
      const listingMap = new Map(listings.map((l) => [l.strategyId, l]));
      for (const strategy of result.data) {
        const listing = listingMap.get(strategy.id);
        if (listing) {
          strategy.listingId = listing.id;
          strategy.listingPriceUsdMonthly = listing.priceUsdMonthly;
          strategy.listingBillingCycle = listing.billingCycle;
        }
      }
    }

    return result;
  }

  // ── Listing CRUD ───────────────────────────────────────────────

  async createListing(data: { strategyId: string; tenantId: string; priceUsdMonthly: number; billingCycle: string; isActive: boolean; status: string; }): Promise<IMarketplaceListing> {
    const id = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const listing = await this.listingRepo.create({
      id,
      strategyId: data.strategyId,
      tenantId: data.tenantId,
      priceUsdMonthly: data.priceUsdMonthly,
      billingCycle: data.billingCycle,
      riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
      isActive: data.isActive,
    });
    logger.info('Listing created', { listingId: listing.id });
    return listing;
  }

  async getListing(id: string): Promise<IMarketplaceListing | null> {
    return this.listingRepo.findById(id);
  }

  async updateListing(id: string, updates: Partial<IMarketplaceListing>): Promise<IMarketplaceListing | null> {
    const updated = await this.listingRepo.update(id, updates);
    logger.info('Listing updated', { listingId: id });
    return updated;
  }

  // ── Vetting Jobs ───────────────────────────────────────────────

  async queueVettingJob(strategyId: string): Promise<{ id: string; strategyId: string; status: string }> {
    const job = await this.vettingRepo.create({ strategyId, adminId: 'system', decision: 'queued' });
    logger.info('Vetting job queued', { jobId: job.id, strategyId });
    return { id: String(job.id), strategyId: job.strategyId, status: job.decision };
  }

  async getVettingJob(id: string): Promise<{ id: string; strategyId: string; status: string; result?: { approved: boolean; score: number; feedback: string } } | null> {
    const job = await this.vettingRepo.findById(parseInt(id));
    if (!job) return null;
    return { id: String(job.id), strategyId: job.strategyId, status: job.decision };
  }

  async completeVettingJob(id: string, result: { approved: boolean; score: number; feedback: string }): Promise<boolean> {
    const job = await this.vettingRepo.findById(parseInt(id));
    if (!job) return false;
    await this.vettingRepo.complete(job.id as number, result);
    if (result.approved) {
      await this.strategyRepo.updateStatus(job.strategyId, 'approved');
    } else {
      await this.strategyRepo.updateStatus(job.strategyId, 'rejected');
    }
    logger.info('Vetting job completed', { jobId: id, approved: result.approved });
    return true;
  }

  // ── Performance & Reviews ──────────────────────────────────────

  async getStrategyPerformance(strategyId: string): Promise<IMarketplacePerformance | null> {
    const performances = await this.perfRepo.getLatestByStrategy(strategyId, 1);
    if (!performances.length) return null;
    return performances[0];
  }

  async updateStrategyPerformance(strategyId: string, perf: Partial<IMarketplacePerformance>): Promise<void> {
    const existing = await this.perfRepo.getLatestByStrategy(strategyId, 1);
    const prev = existing[0];
    await this.perfRepo.upsert({
      strategyId,
      date: new Date(),
      totalPnlUsd: perf.totalPnlUsd ?? prev?.totalPnlUsd ?? 0,
      totalTrades: perf.totalTrades ?? prev?.totalTrades ?? 0,
      sharpeRatio: perf.sharpeRatio ?? prev?.sharpeRatio,
      maxDrawdown: perf.maxDrawdown ?? prev?.maxDrawdown,
      winRate: perf.winRate ?? prev?.winRate,
      winningTrades: prev?.winningTrades ?? 0,
      losingTrades: prev?.losingTrades ?? 0,
    });
  }

  async getReviewsForStrategy(strategyId: string): Promise<IMarketplaceReview[]> {
    const result = await this.reviewRepo.findAll({ strategyId });
    return result.data;
  }

  async addReview(review: { tenantId: string; strategyId: string; subscriptionId: string; rating: number; comment: string; isVerified?: boolean; }): Promise<IMarketplaceReview> {
    const id = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.reviewRepo.create({
      id,
      tenantId: review.tenantId,
      strategyId: review.strategyId,
      subscriptionId: review.subscriptionId,
      rating: review.rating,
      comment: review.comment,
      isVerified: review.isVerified ?? true,
    });
  }

  async purchaseStrategy(strategyId: string, userId: string): Promise<{ success: boolean; transactionId?: string }> {
    const strategy = await this.strategyRepo.findById(strategyId);
    if (!strategy) return { success: false };
    const transactionId = `txn_${Date.now()}`;
    // Notify seller of new purchase
    this.notificationService.sendPayoutNotification({
      payoutId: transactionId,
      creatorId: strategy.creatorId,
      amountCents: 0,
      periodStart: new Date().toISOString(),
      periodEnd: new Date().toISOString(),
      strategyName: strategy.name,
    });
    return { success: true, transactionId };
  }

  // ── Initialization ───────────────────────────────────────────────

  /** Start background workers (vetting processor, notification queue). */
  initialize(): void {
    this.vettingWorker.start();
    this.notificationService.start();
    logger.info('[MarketplaceService] Background workers started');
  }
}

export const marketplaceService = MarketplaceService.getInstance();
