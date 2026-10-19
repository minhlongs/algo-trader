/**
 * Marketplace Strategy Listings Route Helpers
 * Cohesive query, payload, and permission helpers for strategy listing routes.
 */

import type { Request } from 'express';
import type { z } from 'zod';
import type { StrategyCategory } from '../../marketplace/models/types';
import type { MarketplaceService } from '../../marketplace/services/marketplace.service';
import {
  publishBodySchema,
  strategyFilterSchema,
  getTenantId,
  isAdmin,
} from './marketplace-strategy-helpers';

export type StrategyFilterInput = z.infer<typeof strategyFilterSchema>;
export type PublishStrategyInput = z.infer<typeof publishBodySchema>;
type CreateStrategyArg = Parameters<MarketplaceService['createStrategy']>[0];

export function buildListStrategiesQuery(filters: StrategyFilterInput) {
  return {
    category: filters.category as StrategyCategory | undefined,
    riskLevel: filters.riskLevel,
    minSharpe: filters.minSharpe,
    maxDrawdown: filters.maxDrawdown,
    status: filters.status || ('approved' as const),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page: filters.page || 1,
    limit: filters.limit || 20,
    search: filters.search,
  };
}

export function canPublishStrategy(req: Request): boolean {
  const reqWithTier = req as Request & { tenant?: { tier?: string }; user?: { tier?: string } };
  const tenantTier = reqWithTier.tenant?.tier || reqWithTier.user?.tier;
  return tenantTier === 'PRO' || tenantTier === 'ENTERPRISE';
}

export function buildCreateStrategyPayload(
  strategyId: string,
  tenantId: string,
  userId: string,
  strategyData: PublishStrategyInput,
): CreateStrategyArg {
  let backtestSummary: {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
    sharpeRatio: number;
    maxDrawdown: number;
    periodDays?: number;
  } | undefined;

  if (strategyData.backtestSummary) {
    const bs = strategyData.backtestSummary;
    backtestSummary = {
      totalTrades: bs.totalTrades || 0,
      winRate: bs.winRate,
      totalPnl: 0,
      sharpeRatio: bs.sharpe ?? 0,
      maxDrawdown: bs.maxDrawdown,
      periodDays: bs.periodDays,
    };
  }

  return {
    id: strategyId,
    tenantId,
    creatorId: userId,
    name: strategyData.name,
    description: strategyData.description,
    category: strategyData.category,
    riskLevel: strategyData.riskLevel,
    minAllocationUsd: strategyData.minAllocationUsd,
    maxAllocationUsd: strategyData.maxAllocationUsd,
    supportedExchanges: strategyData.supportedExchanges || [],
    tags: strategyData.tags || [],
    backtestSummary: backtestSummary as unknown as CreateStrategyArg['backtestSummary'],
  };
}

export function canAccessStrategyDetails(
  strategy: { strategy: { tenantId: string; status: string } },
  req: Request,
): boolean {
  const tenantId = getTenantId(req);
  const isOwner = strategy.strategy.tenantId === tenantId;
  const isApproved = strategy.strategy.status === 'approved';
  return isApproved || isOwner || isAdmin(req);
}
