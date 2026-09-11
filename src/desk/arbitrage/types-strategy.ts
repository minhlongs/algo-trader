/**
 * Arbitrage Strategy, Prediction Market & Graph Types
 */

import type { ArbitrageOpportunity, ExecutionResult } from './types-opportunity';

/**
 * Strategy Executor Interface
 * All arbitrage strategy executors must implement this
 */
export interface StrategyExecutor {
  execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult>;
  validate(opportunity: ArbitrageOpportunity): boolean;
  getMetrics(): StrategyMetrics;
}

export interface StrategyMetrics {
  opportunitiesReceived: number;
  opportunitiesExecuted: number;
  totalProfit: number;
  avgLatencyMs: number;
  errors: number;
}

/**
 * Unified Executor Configuration
 * Combines configs for all arbitrage strategy types
 */
export interface UnifiedExecutorConfig {
  // Cross-exchange / triangular / DEX-CEX / funding-rate
  dryRun?: boolean;
  maxPositionSize?: number;
  slippageTolerance?: number;
  minProfitThreshold?: number;
  timeoutMs?: number;

  // Binary arbitrage (Polymarket)
  binary?: {
    kellyFraction?: number;
    maxDrawdownPct?: number;
    maxPositionSize?: number;
    dryRun?: boolean;
  };

  // Split-merge arbitrage (Polymarket)
  splitMerge?: {
    minProfitThreshold?: number;
    minVolume?: number;
    maxPositionSize?: number;
    dryRun?: boolean;
  };

  // Cross-market ILP arbitrage (multi-market)
  crossMarket?: {
    budgetUsdc?: number;
    maxMarketExposureFraction?: number;
    minEdgeThreshold?: number;
    feeRate?: number;
    timeoutMs?: number;
    dryRun?: boolean;
  };
}

/**
 * Polymarket binary prediction market structure
 */
export interface BinaryMarket {
  conditionId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  endDate: Date;
  resolved: boolean;
}

/**
 * Binary arbitrage opportunity where YES + NO mispricing creates guaranteed profit
 */
export interface BinaryArbitrageOpportunity extends ArbitrageOpportunity {
  market: BinaryMarket;
  /** Deviation from 1.0 — YES + NO prices should sum to ~1.0 */
  mispricing: number;
  edge: 'yes-cheap' | 'no-cheap' | 'both-cheap';
}

/**
 * Split-merge arbitrage opportunity (buy YES + NO, merge for $1)
 */
export interface SplitMergeArbitrageOpportunity extends ArbitrageOpportunity {
  marketId: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  totalCost: number;
  profit: number;
  profitPercent: number;
}

/**
 * Cross-market ILP basket opportunity
 */
export interface CrossMarketArbitrageOpportunity extends ArbitrageOpportunity {
  basket: {
    id: string;
    positions: Array<{
      marketId: string;
      side: 'YES' | 'NO';
      size: number;
      expectedProfit: number;
    }>;
    totalExpectedProfit: number;
    totalCost: number;
  };
}

/**
 * Dependency Graph for Cross-Market Arbitrage
 * Defines market relationships and constraints for ILP optimization
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  marketId: string;
  type: 'market' | 'position';
  metadata?: Record<string, unknown>;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'conflict' | 'hedge' | 'correlation';
  weight: number;
}
