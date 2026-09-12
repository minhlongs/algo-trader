/**
 * Marketplace Strategy Operations
 * Pure CRUD operations for strategy lifecycle management.
 */

import { logger } from '../../../shared/utils/logger';
import type {
  StrategyRepository,
  ListingRepository,
  PerformanceRepository,
  ReviewRepository,
} from './repositories';
import type {
  IMarketplaceStrategy,
  IMarketplaceListing,
  StrategyCategory,
  StrategyStatus,
  BacktestSummary,
  PaginatedResult,
  IMarketplaceReview,
  IMarketplacePerformance,
} from '../models/types';

export async function createMarketplaceStrategy(
  strategyRepo: StrategyRepository,
  data: {
    id: string;
    tenantId: string;
    creatorId: string;
    name: string;
    description: string;
    category: StrategyCategory;
    riskLevel: number;
    minAllocationUsd: number;
    maxAllocationUsd: number;
    supportedExchanges: string[];
    tags: string[];
    backtestSummary?: BacktestSummary;
  },
): Promise<IMarketplaceStrategy> {
  const strategy = await strategyRepo.create({
    ...data,
    status: 'draft',
    supportedExchanges: data.supportedExchanges,
    tags: data.tags,
  });
  logger.info('Strategy created', { strategyId: strategy.id });
  return strategy;
}

export async function getMarketplaceStrategyWithDetails(
  strategyRepo: StrategyRepository,
  listingRepo: ListingRepository,
  perfRepo: PerformanceRepository,
  reviewRepo: ReviewRepository,
  id: string,
): Promise<{
  strategy: IMarketplaceStrategy;
  listing?: IMarketplaceListing;
  performance?: IMarketplacePerformance;
  reviews: IMarketplaceReview[];
} | null> {
  const strategy = await strategyRepo.findById(id);
  if (!strategy) return null;
  const listing = await listingRepo.findByStrategyId(id).catch(() => undefined);
  const [performance, reviews] = await Promise.all([
    perfRepo.getLatestByStrategy(id, 1),
    reviewRepo.findAll({ strategyId: id }),
  ]);
  return {
    strategy,
    listing: listing ?? undefined,
    performance: performance[0] || undefined,
    reviews: reviews.data,
  };
}

export async function updateMarketplaceStrategy(
  strategyRepo: StrategyRepository,
  id: string,
  updates: Partial<IMarketplaceStrategy>,
): Promise<IMarketplaceStrategy | null> {
  const existing = await strategyRepo.findById(id);
  if (!existing || existing.status !== 'draft') return existing;
  const updated = await strategyRepo.update(id, updates);
  logger.info('Strategy updated', { strategyId: id });
  return updated;
}

export async function updateMarketplaceStrategyStatus(
  strategyRepo: StrategyRepository,
  id: string,
  status: StrategyStatus,
): Promise<IMarketplaceStrategy | null> {
  const updated = await strategyRepo.updateStatus(id, status);
  logger.info('Strategy status changed', { strategyId: id, status });
  return updated;
}

export async function listMarketplaceStrategies(
  strategyRepo: StrategyRepository,
  filters?: {
    author?: string;
    minRating?: number;
    status?: string;
    category?: string;
    riskLevel?: number;
    minSharpe?: number;
    maxDrawdown?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    search?: string;
  },
): Promise<PaginatedResult<IMarketplaceStrategy>> {
  const strategyFilters: Record<string, unknown> = {};
  if (filters?.status) strategyFilters.status = filters.status;
  if (filters?.category) strategyFilters.category = filters.category;
  if (filters?.search) strategyFilters.search = filters.search;
  if (filters?.riskLevel) strategyFilters.riskLevel = filters.riskLevel;

  return strategyRepo.findAll(
    strategyFilters,
    { page: filters?.page ?? 1, limit: filters?.limit ?? 20 },
    { field: filters?.sortBy ?? 'created_at', order: filters?.sortOrder ?? 'desc' },
  );
}
