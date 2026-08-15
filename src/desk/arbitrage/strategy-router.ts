/**
 * Strategy Router
 * Routes arbitrage opportunities to the correct strategy executor
 * based on opportunity type.
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
  UnifiedExecutorConfig,
} from './types';
import type { BinaryExecutorConfig } from './binary-arbitrage-executor';
import { ExecutorConfig } from './config';
import type { DependencyGraph } from '../../shared/types/semantic-relationships';
import { logger } from '../utils/logger';

import {
  CrossExchangeExecutor,
  BinaryArbitrageStrategyExecutor,
  SplitMergeArbitrageExecutor,
  CrossMarketArbitrageExecutor,
} from './executors';

// Re-export executor classes for backward compatibility
export {
  CrossExchangeExecutor,
  BinaryArbitrageStrategyExecutor,
  SplitMergeArbitrageExecutor,
  CrossMarketArbitrageExecutor,
} from './executors';

/**
 * Main Strategy Router
 * Routes opportunities to the correct executor based on type
 */
export class StrategyRouter {
  private executors: Map<string, StrategyExecutor> = new Map();
  private defaultExecutor: StrategyExecutor;

  constructor(config: UnifiedExecutorConfig = {}) {
    // Initialize executors for each strategy type
    const crossExchangeConfig: Partial<ExecutorConfig> = {
      dryRun: config.dryRun ?? true,
      maxPositionSize: config.maxPositionSize ?? 1000,
      slippageTolerance: config.slippageTolerance ?? 0.5,
      minProfitThreshold: config.minProfitThreshold ?? 0.5,
      timeoutMs: config.timeoutMs ?? 5000,
    };

    const binaryConfig: Partial<BinaryExecutorConfig> = {
      dryRun: config.binary?.dryRun ?? true,
      maxPositionSize: config.binary?.maxPositionSize ?? 1000,
      kellyFraction: config.binary?.kellyFraction ?? 0.25,
      maxDrawdownPct: config.binary?.maxDrawdownPct ?? 0.20,
    };

    const splitMergeConfig = {
      minProfitThreshold: config.splitMerge?.minProfitThreshold ?? 0.001,
      minVolume: config.splitMerge?.minVolume ?? 5000,
      maxPositionSize: config.splitMerge?.maxPositionSize ?? 1000,
      dryRun: config.splitMerge?.dryRun ?? true,
    };

    const crossMarketConfig = {
      budgetUsdc: config.crossMarket?.budgetUsdc ?? 10000,
      maxMarketExposureFraction: config.crossMarket?.maxMarketExposureFraction ?? 0.2,
      minEdgeThreshold: config.crossMarket?.minEdgeThreshold ?? 0.025,
      feeRate: config.crossMarket?.feeRate ?? 0.02,
      timeoutMs: config.crossMarket?.timeoutMs ?? 500,
      dryRun: config.crossMarket?.dryRun ?? true,
    };

    // Register executors
    this.executors.set('cross-exchange', new CrossExchangeExecutor(crossExchangeConfig));
    this.executors.set('triangular', new CrossExchangeExecutor(crossExchangeConfig));
    this.executors.set('dex-cex', new CrossExchangeExecutor(crossExchangeConfig));
    this.executors.set('funding-rate', new CrossExchangeExecutor(crossExchangeConfig));
    this.executors.set('binary-arb', new BinaryArbitrageStrategyExecutor(binaryConfig));
    this.executors.set('settlement-arb', new SplitMergeArbitrageExecutor(splitMergeConfig));
    this.executors.set('cross-market', new CrossMarketArbitrageExecutor(crossMarketConfig));

    // Default fallback
    this.defaultExecutor = new CrossExchangeExecutor(crossExchangeConfig);
  }

  /**
   * Set dependency graph for cross-market executor
   */
  setDependencyGraph(graph: DependencyGraph): void {
    const crossMarketExecutor = this.executors.get('cross-market') as CrossMarketArbitrageExecutor;
    if (crossMarketExecutor) {
      crossMarketExecutor.setDependencyGraph(graph);
    }
  }

  /**
   * Execute an opportunity by routing to the correct executor
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const executor = this.executors.get(opportunity.type) || this.defaultExecutor;

    logger.debug('[StrategyRouter] Routing opportunity', {
      type: opportunity.type,
      id: opportunity.id,
      executor: executor.constructor.name,
    });

    return executor.execute(opportunity);
  }

  /**
   * Validate an opportunity using the correct executor
   */
  validate(opportunity: ArbitrageOpportunity): boolean {
    const executor = this.executors.get(opportunity.type) || this.defaultExecutor;
    return executor.validate(opportunity);
  }

  /**
   * Get aggregated metrics across all executors
   */
  getMetrics(): Record<string, StrategyMetrics> {
    const metrics: Record<string, StrategyMetrics> = {};
    for (const [type, executor] of this.executors.entries()) {
      metrics[type] = executor.getMetrics();
    }
    return metrics;
  }

  /**
   * Get executor for a specific type (for testing/inspection)
   */
  getExecutor(type: string): StrategyExecutor | undefined {
    return this.executors.get(type);
  }
}
