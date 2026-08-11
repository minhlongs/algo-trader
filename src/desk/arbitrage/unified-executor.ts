/**
 * Unified Execution Engine
 * Main entry point for executing all arbitrage strategy types
 * Composes StrategyRouter and provides single execute() interface
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
import { StrategyRouter } from './strategy-router';
import { DependencyGraph } from '../../shared/types/semantic-relationships';
import { logger } from '../utils/logger';

export type { UnifiedExecutorConfig };

/**
 * UnifiedExecutionEngine
 * Single entry point for all arbitrage execution
 * Handles cross-cutting concerns: audit logging, metrics aggregation, error handling
 */
export class UnifiedExecutionEngine {
  private router: StrategyRouter;
  private config: UnifiedExecutorConfig;
  private globalMetrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private auditLog: Array<{ opportunityId: string; type: string; result: ExecutionResult; timestamp: number }> = [];

  constructor(config: UnifiedExecutorConfig = {}) {
    this.config = config;
    this.router = new StrategyRouter(config);
  }

  /**
   * Set dependency graph for cross-market arbitrage
   */
  setDependencyGraph(graph: DependencyGraph): void {
    this.router.setDependencyGraph(graph);
  }

  /**
   * Execute an arbitrage opportunity
   * Routes to correct executor based on opportunity.type
   * Handles audit logging and metrics aggregation
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.globalMetrics.opportunitiesReceived++;

    logger.info('[UnifiedExecutionEngine] Executing opportunity', {
      id: opportunity.id,
      type: opportunity.type,
      expectedProfit: opportunity.expectedProfit,
      expectedProfitPct: opportunity.expectedProfitPct,
    });

    try {
      // Validate before execution
      if (!this.router.validate(opportunity)) {
        const errorResult: ExecutionResult = {
          opportunityId: opportunity.id,
          success: false,
          executedLegs: [],
          actualProfit: 0,
          actualProfitPct: 0,
          totalFees: 0,
          error: `Validation failed for opportunity type: ${opportunity.type}`,
          executedAt: Date.now(),
        };
        this.recordAudit(opportunity, errorResult);
        this.globalMetrics.errors++;
        return errorResult;
      }

      // Execute via router
      const result = await this.router.execute(opportunity);

      // Update global metrics
      if (result.success) {
        this.globalMetrics.opportunitiesExecuted++;
        this.globalMetrics.totalProfit += result.actualProfit;
      } else {
        this.globalMetrics.errors++;
      }

      // Record latency
      const latency = Date.now() - startTime;
      this.latencySamples.push(latency);
      if (this.latencySamples.length > 1000) this.latencySamples.shift();
      this.globalMetrics.avgLatencyMs = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

      // Audit log
      this.recordAudit(opportunity, result);

      logger.info('[UnifiedExecutionEngine] Execution complete', {
        id: opportunity.id,
        success: result.success,
        actualProfit: result.actualProfit,
        latencyMs: latency,
      });

      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        opportunityId: opportunity.id,
        success: false,
        executedLegs: [],
        actualProfit: 0,
        actualProfitPct: 0,
        totalFees: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedAt: Date.now(),
      };

      this.globalMetrics.errors++;
      this.recordAudit(opportunity, errorResult);

      logger.error('[UnifiedExecutionEngine] Execution failed', {
        id: opportunity.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return errorResult;
    }
  }

  /**
   * Validate an opportunity without executing
   */
  validate(opportunity: ArbitrageOpportunity): boolean {
    return this.router.validate(opportunity);
  }

  /**
   * Get aggregated metrics across all strategies
   */
  getMetrics(): StrategyMetrics & { perStrategy: Record<string, StrategyMetrics> } {
    const perStrategy = this.router.getMetrics();
    return {
      ...this.globalMetrics,
      perStrategy,
    };
  }

  /**
   * Get executor for a specific strategy type
   */
  getExecutor(type: string): StrategyExecutor | undefined {
    return this.router.getExecutor(type);
  }

  /**
   * Record audit log entry
   */
  private recordAudit(opportunity: ArbitrageOpportunity, result: ExecutionResult): void {
    this.auditLog.push({
      opportunityId: opportunity.id,
      type: opportunity.type,
      result,
      timestamp: Date.now(),
    });

    // Keep last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
  }

  /**
   * Get audit log (for compliance/debugging)
   */
  getAuditLog(limit = 100): Array<{ opportunityId: string; type: string; result: ExecutionResult; timestamp: number }> {
    return this.auditLog.slice(-limit);
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.globalMetrics = {
      opportunitiesReceived: 0,
      opportunitiesExecuted: 0,
      totalProfit: 0,
      avgLatencyMs: 0,
      errors: 0,
    };
    this.latencySamples = [];
  }
}

/**
 * Factory function to create unified engine with defaults
 */
export function createUnifiedExecutionEngine(config?: UnifiedExecutorConfig): UnifiedExecutionEngine {
  return new UnifiedExecutionEngine(config);
}

/**
 * Execute a single opportunity with automatic engine creation
 * Convenience function for one-off executions
 */
export async function executeArbitrage(
  opportunity: ArbitrageOpportunity,
  config?: UnifiedExecutorConfig
): Promise<ExecutionResult> {
  const engine = createUnifiedExecutionEngine(config);
  return engine.execute(opportunity);
}