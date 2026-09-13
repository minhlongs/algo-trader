/**
 * Unified Execution Engine
 * Main entry point for executing all arbitrage strategy types
 */

import {
  ArbitrageOpportunity,
  ExecutionResult,
  StrategyExecutor,
  StrategyMetrics,
  UnifiedExecutorConfig,
} from './types';
import { StrategyRouter } from './strategy-router';
import { DependencyGraph } from '../../shared/types/semantic-relationships';
import { logger } from '../utils/logger';
import { UnifiedExecutorTelemetry, AuditLogEntry } from './unified-executor-telemetry';

export type { UnifiedExecutorConfig, AuditLogEntry };

/**
 * UnifiedExecutionEngine
 * Single entry point for all arbitrage execution
 */
export class UnifiedExecutionEngine {
  private router: StrategyRouter;
  private config: UnifiedExecutorConfig;
  private telemetry = new UnifiedExecutorTelemetry();

  constructor(config: UnifiedExecutorConfig = {}) {
    this.config = config;
    this.router = new StrategyRouter(config);
  }

  setDependencyGraph(graph: DependencyGraph): void {
    this.router.setDependencyGraph(graph);
  }

  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.telemetry.recordReceived();

    logger.info('[UnifiedExecutionEngine] Executing opportunity', {
      id: opportunity.id,
      type: opportunity.type,
      expectedProfit: opportunity.expectedProfit,
      expectedProfitPct: opportunity.expectedProfitPct,
    });

    try {
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
        this.telemetry.recordAudit(opportunity, errorResult);
        this.telemetry.recordError();
        return errorResult;
      }

      const result = await this.router.execute(opportunity);
      const latency = Date.now() - startTime;
      this.telemetry.recordExecution(result, latency);
      this.telemetry.recordAudit(opportunity, result);

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

      this.telemetry.recordError();
      this.telemetry.recordAudit(opportunity, errorResult);

      logger.error('[UnifiedExecutionEngine] Execution failed', {
        id: opportunity.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return errorResult;
    }
  }

  validate(opportunity: ArbitrageOpportunity): boolean {
    return this.router.validate(opportunity);
  }

  getMetrics(): StrategyMetrics & { perStrategy: Record<string, StrategyMetrics> } {
    return {
      ...this.telemetry.getGlobalMetrics(),
      perStrategy: this.router.getMetrics(),
    };
  }

  getExecutor(type: string): StrategyExecutor | undefined {
    return this.router.getExecutor(type);
  }

  getAuditLog(limit = 100): AuditLogEntry[] {
    return this.telemetry.getAuditLog(limit);
  }

  resetMetrics(): void {
    this.telemetry.reset();
  }
}

export function createUnifiedExecutionEngine(config?: UnifiedExecutorConfig): UnifiedExecutionEngine {
  return new UnifiedExecutionEngine(config);
}

export async function executeArbitrage(
  opportunity: ArbitrageOpportunity,
  config?: UnifiedExecutorConfig
): Promise<ExecutionResult> {
  const engine = createUnifiedExecutionEngine(config);
  return engine.execute(opportunity);
}
