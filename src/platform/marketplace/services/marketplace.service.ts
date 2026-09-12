/**
 * Marketplace Service - Core strategy and listing lifecycle
 * DB-backed singleton, composes repositories and delegates to domain ops.
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
  BacktestSummary, PaginatedResult, IMarketplaceReview, IMarketplacePerformance,
} from '../models/types';
import {
  createMarketplaceStrategy, getMarketplaceStrategyWithDetails,
  updateMarketplaceStrategy, updateMarketplaceStrategyStatus, listMarketplaceStrategies,
} from './marketplace-strategy-ops';
import {
  createMarketplaceListing, getMarketplaceListing, updateMarketplaceListing,
  queueMarketplaceVettingJob, getMarketplaceVettingJob, completeMarketplaceVettingJob,
  getMarketplaceStrategyPerformance, updateMarketplaceStrategyPerformance,
  getMarketplaceReviews, addMarketplaceReview, purchaseMarketplaceStrategy,
} from './marketplace-listing-ops';

export class MarketplaceService {
  private static instance: MarketplaceService;
  public strategyRepo: StrategyRepository;
  public listingRepo: ListingRepository;
  public vettingRepo: VettingJobRepository;
  public reviewRepo: ReviewRepository;
  public perfRepo: PerformanceRepository;
  public auditService: AuditLogService;
  public notificationService: NotificationService;
  public vettingWorker: VettingWorker;

  constructor() {
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
    return createMarketplaceStrategy(this.strategyRepo, data);
  }

  async getStrategy(id: string): Promise<IMarketplaceStrategy | null> {
    return this.strategyRepo.findById(id);
  }

  async getStrategyWithDetails(id: string): Promise<{
    strategy: IMarketplaceStrategy; listing?: IMarketplaceListing;
    performance?: IMarketplacePerformance; reviews: IMarketplaceReview[];
  } | null> {
    return getMarketplaceStrategyWithDetails(this.strategyRepo, this.listingRepo, this.perfRepo, this.reviewRepo, id);
  }

  async updateStrategy(id: string, updates: Partial<IMarketplaceStrategy>): Promise<IMarketplaceStrategy | null> {
    return updateMarketplaceStrategy(this.strategyRepo, id, updates);
  }

  async updateStrategyStatus(id: string, status: StrategyStatus): Promise<IMarketplaceStrategy | null> {
    return updateMarketplaceStrategyStatus(this.strategyRepo, id, status);
  }

  async listStrategies(filters?: { author?: string; minRating?: number; status?: string; category?: string; riskLevel?: number; minSharpe?: number; maxDrawdown?: number; sortBy?: string; sortOrder?: 'asc' | 'desc'; page?: number; limit?: number; search?: string; }): Promise<PaginatedResult<IMarketplaceStrategy>> {
    return listMarketplaceStrategies(this.strategyRepo, filters);
  }

  // ── Listing CRUD ───────────────────────────────────────────────

  async createListing(data: { strategyId: string; tenantId: string; priceUsdMonthly: number; billingCycle: string; isActive: boolean; status: string; }): Promise<IMarketplaceListing> {
    return createMarketplaceListing(this.listingRepo, data);
  }

  async getListing(id: string): Promise<IMarketplaceListing | null> {
    return getMarketplaceListing(this.listingRepo, id);
  }

  async updateListing(id: string, updates: Partial<IMarketplaceListing>): Promise<IMarketplaceListing | null> {
    return updateMarketplaceListing(this.listingRepo, id, updates);
  }

  // ── Vetting Jobs ───────────────────────────────────────────────

  async queueVettingJob(strategyId: string): Promise<{ id: string; strategyId: string; status: string }> {
    return queueMarketplaceVettingJob(this.vettingRepo, strategyId);
  }

  async getVettingJob(id: string): Promise<{ id: string; strategyId: string; status: string; result?: { approved: boolean; score: number; feedback: string } } | null> {
    return getMarketplaceVettingJob(this.vettingRepo, id);
  }

  async completeVettingJob(id: string, result: { approved: boolean; score: number; feedback: string }): Promise<boolean> {
    return completeMarketplaceVettingJob(this.vettingRepo, this.strategyRepo, id, result);
  }

  // ── Performance & Reviews ──────────────────────────────────────

  async getStrategyPerformance(strategyId: string): Promise<IMarketplacePerformance | null> {
    return getMarketplaceStrategyPerformance(this.perfRepo, strategyId);
  }

  async updateStrategyPerformance(strategyId: string, perf: Partial<IMarketplacePerformance>): Promise<void> {
    return updateMarketplaceStrategyPerformance(this.perfRepo, strategyId, perf);
  }

  async getReviewsForStrategy(strategyId: string): Promise<IMarketplaceReview[]> {
    return getMarketplaceReviews(this.reviewRepo, strategyId);
  }

  async addReview(review: { tenantId: string; strategyId: string; subscriptionId: string; rating: number; comment: string; isVerified?: boolean; }): Promise<IMarketplaceReview> {
    return addMarketplaceReview(this.reviewRepo, review);
  }

  async purchaseStrategy(strategyId: string, userId: string): Promise<{ success: boolean; transactionId?: string }> {
    return purchaseMarketplaceStrategy(this.strategyRepo, this.notificationService, strategyId, userId);
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
