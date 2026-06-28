/**
 * Marketplace Service - Stub for type checking
 * Real implementation would handle strategy marketplace operations
 */

export interface MarketplaceStrategy {
  id: string;
  name: string;
  description?: string;
  author: string;
  price: number;
  rating: number;
  downloads: number;
  category?: string;
  riskLevel?: number;
  strategy_code?: string;
  strategy_name?: string;
  use_llm?: boolean;
  tenantId?: string;
  creatorId?: string;
  backtestSummary?: BacktestSummary;
  minAllocationUsd?: number;
  maxAllocationUsd?: number;
  supportedExchanges?: string[];
  tags?: string[];
}

export interface BacktestSummary {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  sharpeRatio: number;
  sharpe?: number; // alias
  maxDrawdown: number;
  periodDays?: number; // optional
}

export interface MarketplaceListing {
  id: string;
  strategyId: string;
  strategy: MarketplaceStrategy;
  tenantId?: string;
  creatorId?: string;
  priceUsdMonthly: number;
  billingCycle: 'monthly' | 'yearly';
  isActive: boolean;
  status: 'active' | 'draft' | 'archived' | 'approved' | 'pending' | 'rejected';
  publishedAt: Date;
  backtestSummary?: BacktestSummary;
}

export interface StrategyPerformance {
  strategyId: string;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  sharpeRatio: number;
  maxDrawdown: number;
  updatedAt: Date;
}

export interface StrategyReview {
  id: string;
  strategyId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

export interface VettingJob {
  id: string;
  strategyId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  result?: {
    approved: boolean;
    score: number;
    feedback: string;
  };
}

export class MarketplaceService {
  private static instance: MarketplaceService;
  private listings: Map<string, MarketplaceListing> = new Map();
  private strategies: Map<string, MarketplaceStrategy> = new Map();
  private performances: Map<string, StrategyPerformance> = new Map();
  private reviews: Map<string, StrategyReview[]> = new Map();
  private vettingJobs: Map<string, VettingJob> = new Map();

  private constructor() {}

  static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) {
      MarketplaceService.instance = new MarketplaceService();
    }
    return MarketplaceService.instance;
  }

  async listStrategies(filter?: {
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
  }): Promise<MarketplaceListing[]> {
    let result = Array.from(this.listings.values());

    if (filter?.author) {
      result = result.filter(l => l.strategy.author === filter.author);
    }
    if (filter?.minRating) {
      result = result.filter(l => l.strategy.rating >= filter.minRating!);
    }
    if (filter?.status) {
      result = result.filter(l => l.status === filter.status);
    }
    if (filter?.category) {
      result = result.filter(l => l.strategy.category === filter.category);
    }
    if (filter?.riskLevel) {
      result = result.filter(l => l.strategy.riskLevel === filter.riskLevel);
    }
    if (filter?.minSharpe) {
      result = result.filter(l => (l.strategy.backtestSummary?.sharpeRatio || 0) >= filter.minSharpe!);
    }
    if (filter?.maxDrawdown) {
      result = result.filter(l => (l.strategy.backtestSummary?.maxDrawdown || 0) <= filter.maxDrawdown!);
    }
    if (filter?.search) {
      const search = filter.search.toLowerCase();
      result = result.filter(l =>
        l.strategy.name.toLowerCase().includes(search) ||
        l.strategy.tags?.some(t => t.toLowerCase().includes(search))
      );
    }

    // Sorting
    if (filter?.sortBy) {
      result.sort((a, b) => {
        let cmp = 0;
        switch (filter.sortBy) {
          case 'sharpe':
            cmp = (a.strategy.backtestSummary?.sharpeRatio || 0) - (b.strategy.backtestSummary?.sharpeRatio || 0);
            break;
          case 'max_drawdown':
            cmp = (a.strategy.backtestSummary?.maxDrawdown || 0) - (b.strategy.backtestSummary?.maxDrawdown || 0);
            break;
          case 'win_rate':
            cmp = (a.strategy.backtestSummary?.winRate || 0) - (b.strategy.backtestSummary?.winRate || 0);
            break;
          case 'total_pnl':
            cmp = (a.strategy.backtestSummary?.totalPnl || 0) - (b.strategy.backtestSummary?.totalPnl || 0);
            break;
          case 'created_at':
            cmp = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
            break;
          default:
            cmp = 0;
        }
        return filter.sortOrder === 'asc' ? cmp : -cmp;
      });
    }

    // Pagination
    const limit = filter?.limit || 20;
    const page = filter?.page || 1;
    const offset = (page - 1) * limit;
    return result.slice(offset, offset + limit);
  }

  async getStrategy(id: string): Promise<MarketplaceListing | null> {
    return this.listings.get(id) || null;
  }

  async getStrategyWithDetails(id: string): Promise<MarketplaceListing & {
    performance?: StrategyPerformance;
    reviews?: StrategyReview[];
  } | null> {
    const listing = this.listings.get(id);
    if (!listing) return null;
    return {
      ...listing,
      performance: this.performances.get(id),
      reviews: this.reviews.get(id),
    };
  }

  async createStrategy(data: Partial<MarketplaceStrategy> & { tenantId?: string; creatorId?: string }): Promise<MarketplaceStrategy> {
    const id = `strat_${Date.now()}`;
    let backtestSummary: BacktestSummary | undefined;
    if (data.backtestSummary) {
      const bs = data.backtestSummary;
      backtestSummary = {
        totalTrades: bs.totalTrades || 0,
        winRate: bs.winRate || 0,
        totalPnl: bs.totalPnl || 0,
        sharpeRatio: bs.sharpeRatio ?? bs.sharpe ?? 0,
        maxDrawdown: bs.maxDrawdown || 0,
        periodDays: bs.periodDays,
      };
    }
    const strategy: MarketplaceStrategy = {
      id,
      name: data.name || 'Unnamed Strategy',
      author: data.author || 'anonymous',
      price: data.price || 0,
      rating: data.rating || 0,
      downloads: data.downloads || 0,
      category: data.category,
      riskLevel: data.riskLevel,
      strategy_code: data.strategy_code,
      strategy_name: data.strategy_name,
      use_llm: data.use_llm,
      tenantId: data.tenantId,
      creatorId: data.creatorId,
      backtestSummary,
      minAllocationUsd: data.minAllocationUsd,
      maxAllocationUsd: data.maxAllocationUsd,
      supportedExchanges: data.supportedExchanges,
      tags: data.tags,
    };
    this.strategies.set(id, strategy);
    return strategy;
  }

  async createListing(
    data: { strategyId: string } & Omit<MarketplaceListing, 'strategy' | 'publishedAt' | 'id'>
  ): Promise<MarketplaceListing> {
    const strategy = this.strategies.get(data.strategyId);
    if (!strategy) throw new Error('Strategy not found');
    const id = `listing_${Date.now()}`;
    const listing: MarketplaceListing = {
      id,
      strategyId: data.strategyId,
      strategy,
      publishedAt: new Date(),
      priceUsdMonthly: data.priceUsdMonthly,
      billingCycle: data.billingCycle,
      isActive: data.isActive,
      status: data.status,
      tenantId: data.tenantId,
      creatorId: data.creatorId,
      backtestSummary: data.backtestSummary,
    };
    this.listings.set(id, listing);
    return listing;
  }

  async updateStrategy(id: string, updates: Partial<MarketplaceStrategy>): Promise<MarketplaceStrategy | null> {
    const existing = this.strategies.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.strategies.set(id, updated);
    // Also update in listings if exists
    const listing = this.listings.get(id);
    if (listing) {
      this.listings.set(id, { ...listing, strategy: updated });
    }
    return updated;
  }

  async updateStrategyStatus(id: string, status: 'active' | 'draft' | 'archived' | 'approved' | 'pending' | 'rejected'): Promise<MarketplaceListing | null> {
    const listing = this.listings.get(id);
    if (!listing) return null;
    const updated = { ...listing, status };
    this.listings.set(id, updated);
    return updated;
  }

  async queueVettingJob(strategyId: string): Promise<VettingJob> {
    const id = `vet_${Date.now()}`;
    const job: VettingJob = {
      id,
      strategyId,
      status: 'queued',
      createdAt: new Date(),
    };
    this.vettingJobs.set(id, job);
    return job;
  }

  async getVettingJob(id: string): Promise<VettingJob | null> {
    return this.vettingJobs.get(id) || null;
  }

  async completeVettingJob(id: string, result: VettingJob['result']): Promise<boolean> {
    const job = this.vettingJobs.get(id);
    if (!job) return false;
    this.vettingJobs.set(id, { ...job, status: 'completed', result });
    return true;
  }

  async getStrategyPerformance(strategyId: string): Promise<StrategyPerformance | null> {
    return this.performances.get(strategyId) || null;
  }

  async updateStrategyPerformance(strategyId: string, perf: Partial<StrategyPerformance>): Promise<void> {
    const existing = this.performances.get(strategyId) || {
      strategyId,
      totalTrades: 0,
      winRate: 0,
      totalPnl: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      updatedAt: new Date(),
    };
    this.performances.set(strategyId, { ...existing, ...perf, updatedAt: new Date() });
  }

  async getReviewsForStrategy(strategyId: string): Promise<StrategyReview[]> {
    return this.reviews.get(strategyId) || [];
  }

  async addReview(review: Omit<StrategyReview, 'id' | 'createdAt'>): Promise<StrategyReview> {
    const id = `review_${Date.now()}`;
    const fullReview: StrategyReview = {
      id,
      createdAt: new Date(),
      ...review,
    };
    const existing = this.reviews.get(review.strategyId) || [];
    this.reviews.set(review.strategyId, [...existing, fullReview]);
    return fullReview;
  }

  async purchaseStrategy(strategyId: string, userId: string): Promise<{ success: boolean; transactionId?: string }> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return { success: false };
    return {
      success: true,
      transactionId: `txn_${Date.now()}`,
    };
  }
}

export const marketplaceService = MarketplaceService.getInstance();
