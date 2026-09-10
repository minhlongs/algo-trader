/**
 * Review Models & Pagination Utilities
 * TypeScript interfaces and types for marketplace reviews and pagination
 */

export interface IMarketplaceReview {
  id: string;
  tenantId: string;
  strategyId: string;
  subscriptionId: string;
  rating: number; // 1-5
  comment: string;
  isVerified: boolean; // true if subscription active at review time
  helpfulVotes: number;
  reportedCount: number;
  isFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PaginationParams = {
  page: number;
  limit: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type SortOrder = 'asc' | 'desc';

export type SortField =
  | 'sharpe'
  | 'max_drawdown'
  | 'win_rate'
  | 'total_pnl'
  | 'subscriber_count'
  | 'created_at';
