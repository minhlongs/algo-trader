/**
 * Cross-exchange / triangular / DEX-CEX / funding-rate executor
 * Wraps the existing ExecutionEngine to implement StrategyExecutor
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
  ExecutorConfig,
} from '../types';
import { ExecutionEngine } from '../executor';

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
      this.metrics.avgLatencyMs =
        this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;

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
