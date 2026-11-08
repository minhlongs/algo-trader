/**
 * Split-merge arbitrage executor (Polymarket buy YES+NO, merge for $1)
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
} from '../types';
import { executePaperSplitMerge } from '../split-merge-arb-executor';
import {
  classifyMarketCategory,
  type PolymarketCategory,
} from '../../polymarket/polymarket-fee-calculator';
import {
  buildSplitMergeOpportunity,
  computeSplitMergePayout,
  computeSplitMergePayoutV2,
  createFailedSplitMergeResult,
  evaluateTakerBuyMergeParity,
  hasRequiredSplitMergeFields,
} from './split-merge-executor-helpers';

export {
  POLY_FEE,
  hasRequiredSplitMergeFields,
  buildSplitMergeOpportunity,
  computeSplitMergePayout,
  computeSplitMergePayoutV2,
  evaluateTakerBuyMergeParity,
  createFailedSplitMergeResult,
  type TakerBuyMergeGuardDecision,
} from './split-merge-executor-helpers';

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
    enforceClobV2MergeParity: boolean;
    category?: PolymarketCategory;
  };

  constructor(
    config: {
      minProfitThreshold?: number;
      minVolume?: number;
      maxPositionSize?: number;
      dryRun?: boolean;
      enforceClobV2MergeParity?: boolean;
      category?: PolymarketCategory;
    } = {},
  ) {
    this.config = {
      minProfitThreshold: config.minProfitThreshold ?? 0.001,
      minVolume: config.minVolume ?? 5000,
      maxPositionSize: config.maxPositionSize ?? 1000,
      dryRun: config.dryRun ?? true,
      enforceClobV2MergeParity: config.enforceClobV2MergeParity ?? false,
      category: config.category,
    };
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.metrics.opportunitiesReceived++;

    if (opportunity.type !== 'settlement-arb') {
      this.metrics.errors++;
      return createFailedSplitMergeResult(opportunity.id, 'Not a split-merge arbitrage opportunity');
    }

    if (!hasRequiredSplitMergeFields(opportunity)) {
      this.metrics.errors++;
      return createFailedSplitMergeResult(
        opportunity.id,
        'Settlement-arb opportunity missing required fields (marketId, yesPrice, noPrice)',
      );
    }

    try {
      const splitMergeOpp = buildSplitMergeOpportunity(opportunity);

      if (this.config.enforceClobV2MergeParity) {
        const category = this.config.category ?? classifyMarketCategory(opportunity.id);
        const requestedPairs =
          splitMergeOpp.totalCost > 0
            ? this.config.maxPositionSize / splitMergeOpp.totalCost
            : 0;
        const yesLegShares = opportunity.legs[0]?.amount ?? requestedPairs;
        const noLegShares = opportunity.legs[1]?.amount ?? requestedPairs;
        const decision = evaluateTakerBuyMergeParity(
          requestedPairs,
          yesLegShares,
          noLegShares,
          splitMergeOpp.yesPrice,
          splitMergeOpp.noPrice,
          category,
        );
        if (!decision.allowed) {
          this.metrics.errors++;
          return createFailedSplitMergeResult(
            opportunity.id,
            `CLOB V2 merge parity guard refused (${decision.reason}): mergeablePairs=${decision.mergeablePairs.toFixed(4)} < requestedPairs=${decision.requestedPairs.toFixed(4)}; grossUp=(${decision.grossUpYesShares}, ${decision.grossUpNoShares})`,
          );
        }
      }

      await executePaperSplitMerge(splitMergeOpp, this.config.maxPositionSize);

      const requestedPairs =
        splitMergeOpp.totalCost > 0
          ? this.config.maxPositionSize / splitMergeOpp.totalCost
          : 0;
      const payout = this.config.enforceClobV2MergeParity
        ? computeSplitMergePayoutV2(
            splitMergeOpp.yesPrice,
            splitMergeOpp.noPrice,
            this.config.maxPositionSize,
            this.config.category ?? classifyMarketCategory(opportunity.id),
            opportunity.legs[0]?.amount ?? requestedPairs,
            opportunity.legs[1]?.amount ?? requestedPairs,
          )
        : computeSplitMergePayout(splitMergeOpp.totalCost, this.config.maxPositionSize);
      const { netProfit, totalFees, actualProfitPct } = payout;
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
        actualProfitPct,
        totalFees,
        executedAt: Date.now(),
      };
    } catch (error) {
      this.metrics.errors++;
      return createFailedSplitMergeResult(
        opportunity.id,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  validate(opportunity: ArbitrageOpportunity): boolean {
    if (opportunity.type !== 'settlement-arb') return false;
    return hasRequiredSplitMergeFields(opportunity);
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}
