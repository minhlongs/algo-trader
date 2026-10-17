/**
 * Arbitrage Opportunity Execution Flow
 *
 * Coordinates pre-trade risk checks, plan construction, submission audit,
 * coordinator execution, and telemetry recording.
 *
 * @module desk/arbitrage/engine/arbitrage-execution-flow
 */

import type { IExchangeConnector } from '../connectors/types';
import type { NetProfitabilityCalculator } from '../net-profitability-calculator';
import type { ArbitrageRiskGuard } from '../arbitrage-risk-guard';
import type { AtomicMultiLegCoordinator } from '../atomic-multileg-coordinator';
import type { ArbitrageMetrics } from '../arbitrage-metrics';
import type { ArbitrageAuditLogger } from '../telemetry/arbitrage-audit-logger';
import type { MultiLegExecutionReport } from '../execution-types';
import type { ArbitrageEngineConfig, ArbitrageOpportunity } from './arbitrage-engine-types';
import { extractOpportunityParams } from './arbitrage-engine-normalizer';
import { recordExecutionMetrics, logExecutionAuditOutcome } from './arbitrage-engine-telemetry';
import { validatePreTradeRiskAndHurdle, buildTwoLegExecutionPlan } from './arbitrage-engine-pretrade';

export interface ExecuteOpportunityContext {
  opp: ArbitrageOpportunity;
  config: ArbitrageEngineConfig;
  mode: 'dry-run' | 'live';
  metrics: ArbitrageMetrics;
  auditLogger: ArbitrageAuditLogger;
  riskGuard: ArbitrageRiskGuard;
  profitabilityCalc: NetProfitabilityCalculator;
  coordinator: AtomicMultiLegCoordinator;
  connectorResolver: (venue: string) => IExchangeConnector | undefined;
  onExecutionStart: () => void;
  onExecutionEnd: () => void;
}

export async function runOpportunityExecutionFlow(
  ctx: ExecuteOpportunityContext,
): Promise<MultiLegExecutionReport | null> {
  const { opp, config, mode, metrics, auditLogger, riskGuard, coordinator, connectorResolver } = ctx;
  const extracted = extractOpportunityParams(opp);
  const { buyVenue, sellVenue, symbol, buyPrice, sellPrice } = extracted;

  await auditLogger.logOpportunityIngested({
    id: opp.id,
    symbol,
    buyVenue,
    sellVenue,
    buyPrice,
    sellPrice,
    spreadBps: opp.spreadBps ?? (buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 10000 : 0),
    netProfitBps: opp.netProfitBps,
  });

  const minHurdleBps = config.minNetProfitBps ?? config.riskConfig?.minHurdleBps ?? 10;
  const preTrade = await validatePreTradeRiskAndHurdle({
    opp,
    extracted,
    minHurdleBps,
    mode,
    riskGuard,
    auditLogger,
    connectorResolver,
  });

  if (!preTrade.allowed) {
    return null;
  }

  const plan = buildTwoLegExecutionPlan({
    opportunityId: opp.id,
    symbol,
    buyVenue,
    sellVenue,
    sizedAmount: preTrade.sizedAmount,
    buyPrice,
    sellPrice,
  });

  await auditLogger.logOrderSubmitted({
    orderId: plan.orderId,
    opportunityId: plan.opportunityId,
    symbol,
    legsCount: plan.legs.length,
    totalNotionalUsd: preTrade.sizedAmount * buyPrice,
    executionMode: plan.executionMode,
  });

  ctx.onExecutionStart();

  let report: MultiLegExecutionReport;
  try {
    report = await coordinator.execute(plan);
  } finally {
    ctx.onExecutionEnd();
  }

  recordExecutionMetrics(report, metrics, mode, buyVenue, sellVenue);
  await logExecutionAuditOutcome(report, auditLogger, metrics, buyVenue);

  return report;
}
