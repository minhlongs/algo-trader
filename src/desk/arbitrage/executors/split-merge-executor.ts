/**
 * Split-merge arbitrage executor (Polymarket buy YES+NO, merge for $1)
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
  SplitMergeArbitrageOpportunity,
} from '../types';
import {
  executePaperSplitMerge,
  type SplitMergeOpportunity,
} from '../split-merge-arb-executor';
import { logger } from '../../../shared/utils/logger';

const POLY_FEE = 0.02;

export class SplitMergeArbitrageExecutor implements StrategyExecutor {
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private config: {
    minProfitThreshold: number;
    minVolume: number;
    maxPositionSize: number;
    dryRun: boolean;
  };

  constructor(
    config: {
      minProfitThreshold?: number;
      minVolume?: number;
      maxPositionSize?: number;
      dryRun?: boolean;
    } = {},
  ) {
    this.config = {
      minProfitThreshold: config.minProfitThreshold ?? 0.001,
      minVolume: config.minVolume ?? 5000,
      maxPositionSize: config.maxPositionSize ?? 1000,
      dryRun: config.dryRun ?? true,
    };
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.metrics.opportunitiesReceived++;

    if (opportunity.type !== 'settlement-arb') {
      this.metrics.errors++;
      return {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: 'Not a split-merge arbitrage opportunity',
        executedAt: Date.now(),
      };
    }

    // Validate required fields for a settlement-arb opportunity
    const candidate = opportunity as unknown as Record<string, unknown>;
    if (
      typeof candidate.marketId !== 'string' ||
      typeof candidate.yesPrice !== 'number' ||
      typeof candidate.noPrice !== 'number'
    ) {
      this.metrics.errors++;
      return {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: 'Settlement-arb opportunity missing required fields (marketId, yesPrice, noPrice)',
        executedAt: Date.now(),
      };
    }

    try {
      // Use actual fields from the opportunity
      const smOpp = opportunity as SplitMergeArbitrageOpportunity;
      const { yesPrice, noPrice } = smOpp;
      const totalCost = yesPrice + noPrice;
      const splitMergeOpp: SplitMergeOpportunity = {
        marketId: opportunity.id,
        title: opportunity.id,
        yesPrice,
        noPrice,
        totalCost,
        profit: 1.0 - POLY_FEE - totalCost,
        profitPercent: ((1.0 - POLY_FEE - totalCost) / totalCost) * 100,
      };

      const trade = await executePaperSplitMerge(
        splitMergeOpp,
        this.config.maxPositionSize,
      );

      // Compute net profit from trade: proceeds (pairs * 1.0) - fee - sizeUsdc
      const pairs = this.config.maxPositionSize / splitMergeOpp.totalCost;
      const netProfit = pairs - pairs * POLY_FEE - this.config.maxPositionSize;
      const success = netProfit > 0;

      if (success) {
        this.metrics.opportunitiesExecuted++;
        this.metrics.totalProfit += netProfit;
      } else {
        this.metrics.errors++;
      }

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs =
        this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      return {
        opportunityId: opportunity.id,
        success,
        executedLegs: [],
        actualProfit: netProfit,
        actualProfitPct: (netProfit / (this.config.maxPositionSize || 1)) * 100,
        totalFees: pairs * POLY_FEE,
        executedAt: Date.now(),
      };
    } catch (error) {
      this.metrics.errors++;
      return {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedAt: Date.now(),
      };
    }
  }

  validate(opportunity: ArbitrageOpportunity): boolean {
    if (opportunity.type !== 'settlement-arb') return false;
    const opp = opportunity as unknown as Record<string, unknown>;
    return (
      typeof opp.marketId === 'string' &&
      typeof opp.yesPrice === 'number' &&
      typeof opp.noPrice === 'number'
    );
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}
