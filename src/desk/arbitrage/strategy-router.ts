/**
 * Strategy Router
 * Routes arbitrage opportunities to the correct strategy executor
 * based on opportunity type.
 */

import {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
  UnifiedExecutorConfig,
  BinaryArbitrageOpportunity,
  SplitMergeArbitrageOpportunity,
  CrossMarketArbitrageOpportunity,
} from './types';
import { BinaryArbitrageExecutor, BinaryExecutorConfig } from './binary-arbitrage-executor';
import { ExecutionEngine } from './executor';
import { ExecutorConfig, DEFAULT_EXECUTOR_CONFIG } from './config';
import { executePaperSplitMerge, SplitMergeOpportunity } from './split-merge-arb-executor';
import { detectCrossMarketArbitrage, MarketPrice, DetectorResult } from './cross-market-arbitrage-detector';
import { DependencyGraph, MarketRelationship, RelationType } from '../../shared/types/semantic-relationships';
import { logger } from '../utils/logger';

/**
 * Cross-exchange / triangular / DEX-CEX / funding-rate executor
 * Wraps the existing ExecutionEngine to implement StrategyExecutor
 */
export class CrossExchangeExecutor implements StrategyExecutor {
  private engine: ExecutionEngine;
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.engine = new ExecutionEngine(config);
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.metrics.opportunitiesReceived++;

    try {
      const result = await this.engine.execute(opportunity);

      if (result.success) {
        this.metrics.opportunitiesExecuted++;
        this.metrics.totalProfit += result.actualProfit;
      } else {
        this.metrics.errors++;
      }

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      return result;
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
    return this.engine.validateOpportunity(opportunity);
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}

/**
 * Binary arbitrage executor (Polymarket YES/NO mispricing)
 */
export class BinaryArbitrageStrategyExecutor implements StrategyExecutor {
  private executor: BinaryArbitrageExecutor;
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];

  constructor(config: Partial<BinaryExecutorConfig> = {}) {
    this.executor = new BinaryArbitrageExecutor(config);
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.metrics.opportunitiesReceived++;

    // Type guard for binary opportunity
    if (opportunity.type !== 'binary-arb') {
      this.metrics.errors++;
      return {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: 'Not a binary arbitrage opportunity',
        executedAt: Date.now(),
      };
    }

    try {
      const binaryOpp = opportunity as BinaryArbitrageOpportunity;
      const result = await this.executor.execute(binaryOpp);

      if (result.success) {
        this.metrics.opportunitiesExecuted++;
        this.metrics.totalProfit += result.actualProfit;
      } else {
        this.metrics.errors++;
      }

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      return result;
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
    return opportunity.type === 'binary-arb' && opportunity.legs.length > 0;
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}

/**
 * Split-merge arbitrage executor (Polymarket buy YES+NO, merge for $1)
 */
export class SplitMergeArbitrageExecutor implements StrategyExecutor {
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private config: { minProfitThreshold: number; minVolume: number; maxPositionSize: number; dryRun: boolean };

  constructor(config: { minProfitThreshold?: number; minVolume?: number; maxPositionSize?: number; dryRun?: boolean } = {}) {
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

    try {
      const splitMergeOpp = opportunity as SplitMergeArbitrageOpportunity;

      // Convert to SplitMergeOpportunity format
      const smOpp: SplitMergeOpportunity = {
        marketId: splitMergeOpp.marketId,
        title: splitMergeOpp.title,
        yesPrice: splitMergeOpp.yesPrice,
        noPrice: splitMergeOpp.noPrice,
        totalCost: splitMergeOpp.totalCost,
        profit: splitMergeOpp.profit,
        profitPercent: splitMergeOpp.profitPercent,
      };

      // Execute as paper trade (dry-run mode)
      await executePaperSplitMerge(smOpp, this.config.maxPositionSize);

      const result: ExecutionResult = {
        opportunityId: opportunity.id,
        success: true,
        executedLegs: [
          {
            exchange: 'polymarket',
            symbol: splitMergeOpp.marketId,
            side: 'buy',
            executedPrice: splitMergeOpp.yesPrice,
            executedAmount: this.config.maxPositionSize / 2,
            fee: 0,
          },
          {
            exchange: 'polymarket',
            symbol: splitMergeOpp.marketId,
            side: 'buy',
            executedPrice: splitMergeOpp.noPrice,
            executedAmount: this.config.maxPositionSize / 2,
            fee: 0,
          },
        ],
        actualProfit: splitMergeOpp.profit * (this.config.maxPositionSize / splitMergeOpp.totalCost),
        actualProfitPct: splitMergeOpp.profitPercent,
        totalFees: 0,
        executedAt: Date.now(),
      };

      this.metrics.opportunitiesExecuted++;
      this.metrics.totalProfit += result.actualProfit;

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      return result;
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
    return opportunity.type === 'settlement-arb';
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}

/**
 * Cross-market ILP arbitrage executor (multi-market portfolio optimization)
 */
export class CrossMarketArbitrageExecutor implements StrategyExecutor {
  private metrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private config: { budgetUsdc: number; maxMarketExposureFraction: number; minEdgeThreshold: number; feeRate: number; timeoutMs: number; dryRun: boolean };
  private dependencyGraph: DependencyGraph | null = null; // Will be set externally

  constructor(config: { budgetUsdc?: number; maxMarketExposureFraction?: number; minEdgeThreshold?: number; feeRate?: number; timeoutMs?: number; dryRun?: boolean } = {}) {
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
      // Use actual prices from the opportunity's basket positions
      const prices: MarketPrice[] = crossMarketOpp.basket.positions.map(pos => ({
        marketId: pos.marketId,
        question: '', // Would be fetched from graph
        yesPrice: pos.side === 'YES' ? pos.expectedProfit / pos.size + 0.5 : 0.5, // Derived from expected profit
        noPrice: pos.side === 'NO' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
        liquidity: 50000,
      }));

      // Detect and solve cross-market arbitrage
      const result: DetectorResult = detectCrossMarketArbitrage(prices, this.dependencyGraph, {
        budgetUsdc: this.config.budgetUsdc,
        maxMarketExposureFraction: this.config.maxMarketExposureFraction,
        minEdgeThreshold: this.config.minEdgeThreshold,
        feeRate: this.config.feeRate,
        timeoutMs: this.config.timeoutMs,
      });

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
          executedPrice: pos.side === 'YES' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
          executedAmount: pos.size,
          fee: pos.size * this.config.feeRate,
        })),
        actualProfit: result.basket.totalExpectedProfit,
        actualProfitPct: (result.basket.totalExpectedProfit / result.basket.totalCost) * 100,
        totalFees: result.basket.totalCost * this.config.feeRate,
        executedAt: Date.now(),
      };

      this.metrics.opportunitiesExecuted++;
      this.metrics.totalProfit += execResult.actualProfit;

      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.metrics.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

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