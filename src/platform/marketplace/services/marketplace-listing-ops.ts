/**
 * Marketplace Listing & Lifecycle Operations
 * Handlers for listings, vetting workflow, reviews, performance, and purchases.
 */

import { logger } from '../../../shared/utils/logger';
import type {
  ListingRepository, VettingJobRepository, StrategyRepository,
  PerformanceRepository, ReviewRepository,
} from './repositories';
import type { NotificationService } from '../notifications/notification-service';
import type { IMarketplaceListing, IMarketplacePerformance, IMarketplaceReview } from '../models/types';

export async function createMarketplaceListing(
  listingRepo: ListingRepository,
  data: { strategyId: string; tenantId: string; priceUsdMonthly: number; billingCycle: string; isActive: boolean; status: string; },
): Promise<IMarketplaceListing> {
  const id = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const listing = await listingRepo.create({
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

export async function getMarketplaceListing(listingRepo: ListingRepository, id: string): Promise<IMarketplaceListing | null> {
  return listingRepo.findById(id);
}

export async function updateMarketplaceListing(
  listingRepo: ListingRepository,
  id: string,
  updates: Partial<IMarketplaceListing>,
): Promise<IMarketplaceListing | null> {
  const updated = await listingRepo.update(id, updates);
  logger.info('Listing updated', { listingId: id });
  return updated;
}

export async function queueMarketplaceVettingJob(
  vettingRepo: VettingJobRepository,
  strategyId: string,
): Promise<{ id: string; strategyId: string; status: string }> {
  const job = await vettingRepo.create({ strategyId, adminId: 'system', decision: 'queued' });
  logger.info('Vetting job queued', { jobId: job.id, strategyId });
  return { id: String(job.id), strategyId: job.strategyId, status: job.decision };
}

export async function getMarketplaceVettingJob(
  vettingRepo: VettingJobRepository,
  id: string,
): Promise<{ id: string; strategyId: string; status: string; result?: { approved: boolean; score: number; feedback: string } } | null> {
  const job = await vettingRepo.findById(parseInt(id, 10));
  if (!job) return null;
  return { id: String(job.id), strategyId: job.strategyId, status: job.decision };
}

export async function completeMarketplaceVettingJob(
  vettingRepo: VettingJobRepository,
  strategyRepo: StrategyRepository,
  id: string,
  result: { approved: boolean; score: number; feedback: string },
): Promise<boolean> {
  const job = await vettingRepo.findById(parseInt(id, 10));
  if (!job) return false;
  await vettingRepo.complete(job.id as number, result);
  if (result.approved) {
    await strategyRepo.updateStatus(job.strategyId, 'approved');
  } else {
    await strategyRepo.updateStatus(job.strategyId, 'rejected');
  }
  logger.info('Vetting job completed', { jobId: id, approved: result.approved });
  return true;
}

export async function getMarketplaceStrategyPerformance(
  perfRepo: PerformanceRepository,
  strategyId: string,
): Promise<IMarketplacePerformance | null> {
  const performances = await perfRepo.getLatestByStrategy(strategyId, 1);
  return performances.length ? performances[0] : null;
}

export async function updateMarketplaceStrategyPerformance(
  perfRepo: PerformanceRepository,
  strategyId: string,
  perf: Partial<IMarketplacePerformance>,
): Promise<void> {
  const existing = await perfRepo.getLatestByStrategy(strategyId, 1);
  const prev = existing[0];
  await perfRepo.upsert({
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

export async function getMarketplaceReviews(reviewRepo: ReviewRepository, strategyId: string): Promise<IMarketplaceReview[]> {
  const result = await reviewRepo.findAll({ strategyId });
  return result.data;
}

export async function addMarketplaceReview(
  reviewRepo: ReviewRepository,
  review: {
    tenantId: string; strategyId: string; subscriptionId: string;
    rating: number; comment: string; isVerified?: boolean;
  },
): Promise<IMarketplaceReview> {
  const id = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return reviewRepo.create({
    id,
    tenantId: review.tenantId,
    strategyId: review.strategyId,
    subscriptionId: review.subscriptionId,
    rating: review.rating,
    comment: review.comment,
    isVerified: review.isVerified ?? true,
  });
}

export async function purchaseMarketplaceStrategy(
  strategyRepo: StrategyRepository,
  notificationService: NotificationService,
  strategyId: string,
  _userId: string,
): Promise<{ success: boolean; transactionId?: string }> {
  const strategy = await strategyRepo.findById(strategyId);
  if (!strategy) return { success: false };
  const transactionId = `txn_${Date.now()}`;
  notificationService.sendPayoutNotification({
    payoutId: transactionId,
    creatorId: strategy.creatorId,
    amountCents: 0,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    strategyName: strategy.name,
  });
  return { success: true, transactionId };
}
