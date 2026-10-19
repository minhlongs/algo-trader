/**
 * Pure badge eligibility and database row-mapping helpers for badge-repository.ts
 */

import type { BadgeKey, BadgeDefinition } from './badge-service';

export interface StrategyDataForBadging {
  createdAge: number;
  isApproved: boolean;
  hasVettedAt: boolean;
  perfs: Array<{ sharpeRatio: number; maxDrawdown: number; totalPnlUsd: number; totalTrades: number }>;
}

export function daysSince(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function computeSharpePercentileFromRows(
  higherRow: Record<string, unknown> | undefined,
  totalRow: Record<string, unknown> | undefined,
): number {
  const higher = Number(higherRow?.cnt ?? 0);
  const total = Number(totalRow?.cnt ?? 1);
  return total > 0 ? (total - higher) / total : 0;
}

export function mapListingForBadgingRow(
  r: Record<string, unknown>,
): { listingId: string; strategyId: string } {
  return {
    listingId: r.listing_id as string,
    strategyId: r.strategy_id as string,
  };
}

export function mapStrategyDataRows(
  strategy: Record<string, unknown> | undefined,
  perfRows: Array<Record<string, unknown>>,
): StrategyDataForBadging {
  if (!strategy) {
    return { createdAge: 0, isApproved: false, hasVettedAt: false, perfs: [] };
  }

  const createdAge = strategy.created_at ? daysSince(strategy.created_at as Date) : 0;

  return {
    createdAge,
    isApproved: strategy.status === 'approved',
    hasVettedAt: strategy.vetted_at != null,
    perfs: perfRows.map((r: Record<string, unknown>) => ({
      sharpeRatio: Number(r.sharpe_ratio ?? 0),
      maxDrawdown: Number(r.max_drawdown ?? 100),
      totalPnlUsd: Number(r.total_pnl_usd ?? 0),
      totalTrades: Number(r.total_trades ?? 0),
    })),
  };
}

export function mapBadgeDefinitionRow(r: Record<string, unknown>): BadgeDefinition {
  return {
    key: r.key as BadgeKey,
    displayName: r.display_name as string,
    description: r.description as string,
    icon: r.icon as string,
    color: r.color as string,
    sortOrder: r.sort_order as number,
  };
}
