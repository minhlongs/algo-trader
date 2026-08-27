/**
 * Trading Loop — opportunity execution
 * Extracted from TradingLoop.handleOpportunities (facade keeps behavior identical).
 * Pure function over explicit deps: no class coupling, one-way dependency.
 */

import crypto from 'crypto';
import { logAudit, hashIpAddress } from '../../seed/security/audit-log';
import type { IAuditEntry } from '../../seed/security/audit-log';
import { logger } from '../utils/logger';
import type { ArbitrageOpportunity as SpreadOpportunity } from './spread-detector-types';
import type { ExecutionEngine, ArbitrageOpportunity, ArbitrageLeg, ExchangeId } from './types';
import type { TradingLoopMetrics } from './trading-loop-types';

export interface OpportunityExecutionDeps {
  executionEngine: ExecutionEngine;
  metrics: TradingLoopMetrics;
  emit: (event: string, payload: unknown) => void;
  log: (level: string, message: string) => void;
}

/**
 * Handle detected arbitrage opportunities
 */
export async function executeOpportunities(
  deps: OpportunityExecutionDeps,
  opportunities: SpreadOpportunity[],
): Promise<void> {
  const { executionEngine, metrics, emit, log } = deps;
  for (const opp of opportunities) {
    log('opportunity', JSON.stringify({
      id: opp.id,
      symbol: opp.symbol,
      spread: opp.spreadPercent.toFixed(4),
      score: opp.score,
      confidence: opp.confidence,
    }));

    emit('opportunity', opp);

    // Execute if confidence is high enough
    if (opp.confidence === 'high' || (opp.score && opp.score >= 80)) {
      try {
        // Convert SpreadOpportunity to ArbitrageOpportunity format
        const legs: ArbitrageLeg[] = [
          {
            exchange: opp.buyExchange as ExchangeId,
            symbol: opp.symbol,
            side: 'buy',
            price: opp.buyPrice,
            amount: 1000, // Default amount
            fee: 0.001, // Default fee
          },
          {
            exchange: opp.sellExchange as ExchangeId,
            symbol: opp.symbol,
            side: 'sell',
            price: opp.sellPrice,
            amount: 1000,
            fee: 0.001,
          },
        ];

        const arbitrageOpp: ArbitrageOpportunity = {
          id: opp.id,
          type: 'cross-exchange',
          legs,
          expectedProfit: opp.spread,
          expectedProfitPct: opp.spreadPercent,
          totalFees: 0.002,
          confidence: opp.confidence === 'high' ? 90 : opp.confidence === 'medium' ? 70 : 50,
          detectedAt: opp.timestamp,
          expiresAt: opp.timestamp + 5000,
        };

        const result = await executionEngine.execute(arbitrageOpp);
        metrics.opportunitiesExecuted++;

        await logAudit({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          actor: 'system',
          action: 'trade_decision',
          resource: 'Trade',
          result: 'success',
          metadata: {
            opportunityId: opp.id,
            symbol: opp.symbol,
            spreadPercent: opp.spreadPercent,
            confidence: opp.confidence,
            score: opp.score,
          },
          ipHash: hashIpAddress(undefined),
          tenantId: 'system-tenant',
        } as IAuditEntry).catch((err) => logger.error('[TradingLoop] Failed to append tenant audit log:', err));

        if (result.success) {
          metrics.totalProfit += result.actualProfit;
          log('execution', `Executed ${opp.id}: profit $${result.actualProfit.toFixed(2)}`);
        } else {
          log('error', `Execution failed: ${result.error}`);
        }

        emit('execution', { opportunity: arbitrageOpp, result });
      } catch (error) {
        metrics.errors++;
        log('error', `Execution error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
