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
  type DetectorResult,
} from '../cross-market-arbitrage-detector';
import type { DependencyGraph } from '../../../shared/types/semantic-relationships';
import {
  type CrossMarketExecutorConfig,
  resolveCrossMarketConfig,
  buildFailedExecutionResult,
  mapPositionsToMarketPrices,
  buildSuccessExecutionResult,
} from './cross-market-executor-helpers';

export type { CrossMarketExecutorConfig };
export {
  resolveCrossMarketConfig,
  buildFailedExecutionResult,
  mapPositionsToMarketPrices,
  buildSuccessExecutionResult,
};

export class CrossMarketArbitrageExecutor implements StrategyExecutor {
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private config: CrossMarketExecutorConfig;
  private dependencyGraph: DependencyGraph | null = null;

  constructor(config: Partial<CrossMarketExecutorConfig> = {}) {
    this.config = resolveCrossMarketConfig(config);
  }

  setDependencyGraph(graph: DependencyGraph): void {
    this.dependencyGraph = graph;
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.metrics.opportunitiesReceived++;

    if (opportunity.type !== 'cross-market') {
      this.metrics.errors++;
      return buildFailedExecutionResult(opportunity.id, 'Not a cross-market arbitrage opportunity');
    }

    if (!this.dependencyGraph) {
      this.metrics.errors++;
      return buildFailedExecutionResult(
        opportunity.id,
        'Dependency graph not configured for cross-market arbitrage',
      );
    }

    try {
      const crossMarketOpp = opportunity as CrossMarketArbitrageOpportunity;
      const prices = mapPositionsToMarketPrices(crossMarketOpp.basket.positions);

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
        return buildFailedExecutionResult(opportunity.id, 'No valid basket found');
      }

      const execResult = buildSuccessExecutionResult(
        opportunity.id,
        result.basket,
        this.config.feeRate,
      );

      this.metrics.opportunitiesExecuted++;
      this.metrics.totalProfit += execResult.actualProfit;

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs =
        this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      return execResult;
    } catch (error) {
      this.metrics.errors++;
      return buildFailedExecutionResult(
        opportunity.id,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  validate(opportunity: ArbitrageOpportunity): boolean {
    return opportunity.type === 'cross-market' && this.dependencyGraph !== null;
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}
