/**
 * Binary arbitrage executor (Polymarket YES/NO mispricing)
 */

import type {
  ArbitrageOpportunity,
  BinaryArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
} from '../types';
import {
  BinaryArbitrageExecutor,
  type BinaryExecutorConfig,
} from '../binary-arbitrage-executor';

export { BinaryExecutorConfig } from '../binary-arbitrage-executor';

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
      const result = await this.executor.execute(opportunity as BinaryArbitrageOpportunity);

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
    return opportunity.type === 'binary-arb' && opportunity.legs.length > 0;
  }

  getMetrics(): StrategyMetrics {
    return { ...this.metrics };
  }
}
