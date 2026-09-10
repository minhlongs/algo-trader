/**
 * Strategy & Listing Models
 * TypeScript interfaces and types for marketplace strategies, listings, rankings, and performance
 */

export interface IMarketplaceStrategy {
  id: string;
  tenantId: string;
  creatorId: string;
  name: string;
  description: string;
  category: StrategyCategory;
  status: StrategyStatus;
  riskLevel: number; // 1-10
  minAllocationUsd: number; // in cents
  maxAllocationUsd: number; // in cents
  supportedExchanges: string[]; // e.g., ['polymarket', 'binance']
  tags: string[];
  payoutAddress?: string; // USDT TRC20 wallet for creator payouts
  backtestSummary?: BacktestSummary;
  vettedAt?: Date;
  vettedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type StrategyCategory =
  | 'arbitrage'
  | 'momentum'
  | 'mean-reversion'
  | 'statistical'
  | 'portfolio'
  | 'risk'
  | 'hedging'
  | 'other';

export type StrategyStatus =
  | 'draft'
  | 'pending_vetting'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface BacktestSummary {
  sharpe: number;
  maxDrawdown: number; // percentage
  winRate: number; // percentage
  periodDays: number;
  totalTrades?: number;
  totalPnlUsd?: number;
  profitFactor?: number;
}

export interface IMarketplaceListing {
  id: string;
  strategyId: string;
  tenantId: string; // redundant for query performance
  priceUsdMonthly: number; // in cents
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  riskLimits: RiskLimits;
  allowedTenants: string[]; // empty = all allowed
  excludedTenants: string[]; // blacklist
  isActive: boolean;
  subscriberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RiskLimits {
  maxDailyLossPercent: number;
  maxPositionSizePercent: number;
  stopLossPercent: number;
  maxConcurrentTrades: number;
}

export interface CustomRiskLimits {
  maxDailyLossPercent?: number;
  maxPositionSizePercent?: number;
  stopLossPercent?: number;
  maxConcurrentTrades?: number;
}

export interface IMarketplacePerformance {
  id?: number; // auto-increment
  strategyId: string;
  tenantId?: string | null; // null = aggregate (published strategy)
  date: Date; // performance date (usually daily)
  sharpeRatio?: number;
  maxDrawdown?: number;
  totalPnlUsd: number; // in cents
  winRate?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinUsd?: number;
  avgLossUsd?: number;
  profitFactor?: number;
  volatility?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IStrategyRanking {
  strategyId: string;
  name: string;
  category: string;
  riskLevel: number;
  creatorName: string;
  priceUsdMonthly: number;
  subscriberCount: number;
  avgRating: number;
  reviewCount: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalPnlUsd: number;
  rank: number;
}

export type RankingMetric = 'sharpe' | 'total_pnl' | 'win_rate' | 'subscriber_count';
export type RankingTimeframe = '7d' | '30d' | '90d' | 'all';
