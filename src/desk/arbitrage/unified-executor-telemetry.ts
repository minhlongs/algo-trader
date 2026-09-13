import { ExecutionResult, StrategyMetrics, ArbitrageOpportunity } from './types';

export interface AuditLogEntry {
  opportunityId: string;
  type: string;
  result: ExecutionResult;
  timestamp: number;
}

/**
 * Telemetry and audit log manager for UnifiedExecutionEngine
 */
export class UnifiedExecutorTelemetry {
  private globalMetrics: StrategyMetrics = {
    opportunitiesReceived: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    errors: 0,
  };
  private latencySamples: number[] = [];
  private auditLog: AuditLogEntry[] = [];

  recordReceived(): void {
    this.globalMetrics.opportunitiesReceived++;
  }

  recordExecution(result: ExecutionResult, latencyMs: number): void {
    if (result.success) {
      this.globalMetrics.opportunitiesExecuted++;
      this.globalMetrics.totalProfit += result.actualProfit;
    } else {
      this.globalMetrics.errors++;
    }

    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > 1000) {
      this.latencySamples.shift();
    }
    this.globalMetrics.avgLatencyMs =
      this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }

  recordError(): void {
    this.globalMetrics.errors++;
  }

  recordAudit(opportunity: ArbitrageOpportunity, result: ExecutionResult): void {
    this.auditLog.push({
      opportunityId: opportunity.id,
      type: opportunity.type,
      result,
      timestamp: Date.now(),
    });

    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
  }

  getAuditLog(limit = 100): AuditLogEntry[] {
    return this.auditLog.slice(-limit);
  }

  getGlobalMetrics(): StrategyMetrics {
    return { ...this.globalMetrics };
  }

  reset(): void {
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
