/**
 * Pre-trade risk evaluation, latency discovery, and order plan building for the arbitrage engine.
 *
 * @module desk/arbitrage/engine/arbitrage-engine-pretrade
 */

import type { IExchangeConnector } from '../connectors/types';
import type { ArbitrageRiskGuard, ArbitrageRiskCheckResult } from '../arbitrage-risk-guard';
import type { MultiLegArbitrageOrder } from '../execution-types';
import type { ArbitrageAuditLogger } from '../telemetry/arbitrage-audit-logger';
import { recordArbOrder } from '../arbitrage-metrics';
import type { ArbitrageOpportunity } from './arbitrage-engine-types';
import type { ExtractedOpportunityParams } from './arbitrage-engine-normalizer';

/**
 * Resolve p90 venue latencies from connector stats or default fallbacks.
 */
export function resolveVenueLatencies(
  connectorResolver: (venue: string) => IExchangeConnector | undefined,
  buyVenue: string,
  sellVenue: string,
): { buyLatency: number; sellLatency: number } {
  let buyLatency = 10;
  let sellLatency = 10;

  const buyConn = connectorResolver(buyVenue);
  const sellConn = connectorResolver(sellVenue);

  if (buyConn && 'getLatencyStats' in buyConn && typeof (buyConn as { getLatencyStats: unknown }).getLatencyStats === 'function') {
    const stats = (buyConn as { getLatencyStats: () => { p90?: number } }).getLatencyStats();
    if (typeof stats?.p90 === 'number') buyLatency = stats.p90;
  }
  if (sellConn && 'getLatencyStats' in sellConn && typeof (sellConn as { getLatencyStats: unknown }).getLatencyStats === 'function') {
    const stats = (sellConn as { getLatencyStats: () => { p90?: number } }).getLatencyStats();
    if (typeof stats?.p90 === 'number') sellLatency = stats.p90;
  }

  return { buyLatency, sellLatency };
}

/**
 * Perform pre-trade profit hurdle check and pre-trade risk evaluation.
 */
export async function validatePreTradeRiskAndHurdle(params: {
  opp: ArbitrageOpportunity;
  extracted: ExtractedOpportunityParams;
  minHurdleBps: number;
  mode: 'dry-run' | 'live';
  riskGuard: ArbitrageRiskGuard;
  auditLogger: ArbitrageAuditLogger;
  connectorResolver: (venue: string) => IExchangeConnector | undefined;
}): Promise<{ allowed: boolean; sizedAmount: number }> {
  const { opp, extracted, minHurdleBps, mode, riskGuard, auditLogger, connectorResolver } = params;
  const { buyVenue, sellVenue, symbol, buyPrice, amount } = extracted;

  const computedSpreadBps = buyPrice > 0 ? ((extracted.sellPrice - buyPrice) / buyPrice) * 10000 : 0;
  const effectiveNetProfitBps = opp.netProfitBps ?? computedSpreadBps;

  if (effectiveNetProfitBps < minHurdleBps) {
    await auditLogger.logRiskRejection({ opportunityId: opp.id, rule: 'BELOW_PROFIT_HURDLE', reason: 'BELOW_PROFIT_HURDLE' });
    await auditLogger.logRiskRejected({ opportunityId: opp.id, reason: `Net profit ${effectiveNetProfitBps} bps is below hurdle ${minHurdleBps} bps`, rule: 'BELOW_PROFIT_HURDLE', symbol });
    recordArbOrder({ strategyType: 'cross-exchange', venue: buyVenue, status: 'hurdle_rejected', mode });
    return { allowed: false, sizedAmount: 0 };
  }

  const { buyLatency, sellLatency } = resolveVenueLatencies(connectorResolver, buyVenue, sellVenue);
  const riskCheck: ArbitrageRiskCheckResult = await riskGuard.checkPreTrade({
    symbol,
    buyVenue,
    sellVenue,
    tradeNotionalUsd: amount * buyPrice,
    bankrollUsd: riskGuard.getConfig().capitalUsdc ?? 100000,
    netProfitBps: effectiveNetProfitBps,
    currentDrawdown: 0,
    venueLatencies: { [buyVenue]: buyLatency, [sellVenue]: sellLatency },
  });

  if (!riskCheck.allowed) {
    const reason = riskCheck.rejectionReason ?? 'Risk limit exceeded';
    await auditLogger.logRiskRejection({ opportunityId: opp.id, reason, rule: reason });
    await auditLogger.logRiskRejected({ opportunityId: opp.id, reason, rule: reason, symbol });
    recordArbOrder({ strategyType: 'cross-exchange', venue: buyVenue, status: 'risk_rejected', mode });
    return { allowed: false, sizedAmount: 0 };
  }

  const adjustedNotional = riskCheck.adjustedNotionalUsd ?? 0;
  const sizedAmount = adjustedNotional > 0 && buyPrice > 0 ? adjustedNotional / buyPrice : amount;
  return { allowed: true, sizedAmount };
}

/**
 * Build a concurrent two-leg Arbitrage Execution Order.
 */
export function buildTwoLegExecutionPlan(params: {
  opportunityId: string;
  symbol: string;
  buyVenue: string;
  sellVenue: string;
  sizedAmount: number;
  buyPrice: number;
  sellPrice: number;
}): MultiLegArbitrageOrder {
  const { opportunityId, symbol, buyVenue, sellVenue, sizedAmount, buyPrice, sellPrice } = params;

  return {
    orderId: `exec-${opportunityId}-${Date.now()}`,
    opportunityId,
    executionMode: 'concurrent',
    legs: [
      {
        legId: `leg-buy-${buyVenue}`,
        venue: buyVenue,
        symbol,
        side: 'buy',
        amount: sizedAmount,
        price: buyPrice,
        type: 'limit',
      },
      {
        legId: `leg-sell-${sellVenue}`,
        venue: sellVenue,
        symbol,
        side: 'sell',
        amount: sizedAmount,
        price: sellPrice,
        type: 'limit',
      },
    ],
  };
}
