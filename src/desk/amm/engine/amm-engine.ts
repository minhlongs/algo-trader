/**
 * Master AMM Engine & Lifecycle Orchestrator
 * Unified facade integrating pool state, risk checks, trade execution, and telemetry
 * (Milestone 4 / Feature 15)
 */

import { logger } from '../../../shared/utils/logger';
import { AdverseSelectionGuard } from '../liquidity/adverse-selection-guard';
import { MultiTokenPool, MultiTokenPoolConfig } from '../pool/multi-token-pool';
import { AmmRiskGuard } from '../risk/amm-risk-guard';
import { AmmAuditLogger } from '../telemetry/amm-audit-logger';
import { AmmMetricsRecorder } from '../telemetry/amm-metrics';
import { OutcomeToken, PoolTradeRequest, PoolTradeResult } from '../types/amm-types';
import { RiskCheckResult, RiskContext, TradeIntent } from '../types/risk-types';

export class AmmEngine {
  private pools: Map<string, MultiTokenPool> = new Map();
  private auditLogger: AmmAuditLogger;
  private metrics: AmmMetricsRecorder;
  private adverseGuard: AdverseSelectionGuard;
  private isRunning: boolean = false;

  constructor(auditSecret?: string) {
    this.auditLogger = new AmmAuditLogger(auditSecret);
    this.metrics = new AmmMetricsRecorder();
    this.adverseGuard = new AdverseSelectionGuard();
    this.isRunning = true;
    logger.info('[AmmEngine] AMM Engine initialized');
  }

  public registerPool(poolConfig: MultiTokenPoolConfig): MultiTokenPool {
    const pool = new MultiTokenPool(poolConfig);
    this.pools.set(poolConfig.poolId, pool);
    this.metrics.setActivePoolsCount(this.pools.size);
    this.auditLogger.logEvent('POOL_INITIALIZED', {
      poolId: poolConfig.poolId,
      outcomes: poolConfig.outcomes.map((o: OutcomeToken) => o.name),
      initialCollateral: poolConfig.initialCollateralUsdc,
    }, poolConfig.poolId);
    return pool;
  }

  public getPool(poolId: string): MultiTokenPool | undefined {
    return this.pools.get(poolId);
  }

  public executeTrade(
    trade: PoolTradeRequest,
    riskContext: RiskContext
  ): { success: boolean; result?: PoolTradeResult; rejection?: RiskCheckResult } {
    const pool = this.pools.get(trade.poolId);
    if (!pool) {
      throw new Error(`Pool ${trade.poolId} not found`);
    }

    const tradeIntent: TradeIntent = {
      intentId: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      marketId: trade.poolId,
      poolId: trade.poolId,
      notionalUsd: Math.abs(trade.amount * 0.5),
      expectedEdgeBps: 50,
      venueLatencyMs: riskContext.venueLatencyMs ?? 25,
      action: trade.action,
      outcomeIndex: trade.outcomeIndex,
    };

    const riskVerdict = AmmRiskGuard.evaluatePreTrade(tradeIntent, riskContext);
    if (!riskVerdict.allowed || riskVerdict.verdict === 'REJECTED') {
      this.auditLogger.logEvent('RISK_GATE_REJECTED', {
        intentId: tradeIntent.intentId,
        reason: riskVerdict.reason,
      }, trade.poolId);
      return { success: false, rejection: riskVerdict };
    }

    this.auditLogger.logEvent('RISK_GATE_APPROVED', {
      intentId: tradeIntent.intentId,
      allowedNotionalUsd: riskVerdict.allowedNotionalUsd,
    }, trade.poolId);

    const result = pool.executeTrade(trade);
    const volumeUsd = result.outputAmount * result.effectivePrice;
    this.metrics.recordTrade(volumeUsd);
    this.auditLogger.logEvent('TRADE_EXECUTED', {
      poolId: result.poolId,
      outcomeIndex: result.outcomeIndex,
      action: result.action,
      effectivePrice: result.effectivePrice,
    }, trade.poolId);

    return { success: true, result };
  }

  public getAuditLogger(): AmmAuditLogger {
    return this.auditLogger;
  }

  public getMetrics(): AmmMetricsRecorder {
    return this.metrics;
  }

  public getAdverseGuard(): AdverseSelectionGuard {
    return this.adverseGuard;
  }

  public shutdown(): void {
    this.isRunning = false;
    logger.info('[AmmEngine] AMM Engine gracefully stopped');
  }

  public isActive(): boolean {
    return this.isRunning;
  }
}

// Export MasterAmmEngine alias for full API compatibility
export { AmmEngine as MasterAmmEngine };
