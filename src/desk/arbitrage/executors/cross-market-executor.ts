/**
 * Cross-market ILP arbitrage executor (multi-market portfolio optimization)
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
  CrossMarketArbitrageOpportunity,
} from '../types';
import {
  detectCrossMarketArbitrage,
  type MarketPrice,
  type DetectorResult,
} from '../cross-market-arbitrage-detector';
import type { DependencyGraph } from '../../../shared/types/semantic-relationships';

export class CrossMarketArbitrageExecutor implements StrategyExecutor {
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private config: {
    budgetUsdc: number;
    maxMarketExposureFraction: number;
    minEdgeThreshold: number;
    feeRate: number;
    timeoutMs: number;
    dryRun: boolean;
  };
  private dependencyGraph: DependencyGraph | null = null;

  constructor(
    config: {
      budgetUsdc?: number;
      maxMarketExposureFraction?: number;
      minEdgeThreshold?: number;
      feeRate?: number;
      timeoutMs?: number;
      dryRun?: boolean;
    } = {},
  ) {
    this.config = {
      budgetUsdc: config.budgetUsdc ?? 10000,
      maxMarketExposureFraction: config.maxMarketExposureFraction ?? 0.2,
      minEdgeThreshold: config.minEdgeThreshold ?? 0.025,
      feeRate: config.feeRate ?? 0.02,
      timeoutMs: config.timeoutMs ?? 500,
      dryRun: config.dryRun ?? true,
    };
  }

  setDependencyGraph(graph: DependencyGraph): void {
    this.dependencyGraph = graph;
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.metrics.opportunitiesReceived++;

    if (opportunity.type !== 'cross-market') {
      this.metrics.errors++;
      return {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: 'Not a cross-market arbitrage opportunity',
        executedAt: Date.now(),
      };
    }

    if (!this.dependencyGraph) {
      this.metrics.errors++;
      return {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: 'Dependency graph not configured for cross-market arbitrage',
        executedAt: Date.now(),
      };
    }

    try {
      const crossMarketOpp = opportunity as CrossMarketArbitrageOpportunity;

      // Convert basket positions to MarketPrice format for detector
      const prices: MarketPrice[] = crossMarketOpp.basket.positions.map(pos => ({
        marketId: pos.marketId,
        question: '',
        yesPrice: pos.side === 'YES' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
        noPrice: pos.side === 'NO' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
        liquidity: 50000,
      }));

      // Detect and solve cross-market arbitrage
      const result: DetectorResult = detectCrossMarketArbitrage(
        prices,
        this.dependencyGraph,
        {
          budgetUsdc: this.config.budgetUsdc,
          maxMarketExposureFraction: this.config.maxMarketExposureFraction,
          minEdgeThreshold: this.config.minEdgeThreshold,
          feeRate: this.config.feeRate,
          timeoutMs: this.config.timeoutMs,
        },
      );

      if (!result.basket) {
        return {
          opportunityId: opportunity.id,
          success: false,
          executedLegs: [],
          actualProfit: 0,
          actualProfitPct: 0,
          totalFees: 0,
          error: 'No valid basket found',
          executedAt: Date.now(),
        };
      }

      const execResult: ExecutionResult = {
        opportunityId: opportunity.id,
        success: true,
        executedLegs: result.basket.positions.map(pos => ({
          exchange: 'polymarket',
          symbol: pos.marketId,
          side: pos.side.toLowerCase() as 'buy' | 'sell',
          executedPrice:
            pos.side === 'YES' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
          executedAmount: pos.size,
          fee: pos.size * this.config.feeRate,
        })),
        actualProfit: result.basket.totalExpectedProfit,
        actualProfitPct:
          (result.basket.totalExpectedProfit / result.basket.totalCost) * 100,
        totalFees: result.basket.totalCost * this.config.feeRate,
        executedAt: Date.now(),
      };

      this.metrics.opportunitiesExecuted++;
      this.metrics.totalProfit += execResult.actualProfit;

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs =
        this.latencySamples.reduce((a, b) => a + b, 0) /
        this.latencySamples.length;

      return execResult;
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
    return opportunity.type === 'cross-market' && this.dependencyGraph !== null;
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}
