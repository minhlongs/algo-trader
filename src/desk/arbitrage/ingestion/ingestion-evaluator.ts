/**
 * Opportunity Ingestion Evaluator
 * Evaluates raw arbitrage opportunities against the net profitability engine and minimum hurdle gate.
 */

import type { ArbitrageOpportunity } from '../spread-detector-types';
import {
  type NetProfitabilityCalculator,
  HURDLE_EPSILON_BPS,
} from '../net-profitability-calculator';
import type { IngestionPipelineConfig, OpportunityEvaluationResult } from './ingestion-types';

export function evaluateOpportunity(
  opp: ArbitrageOpportunity,
  calculator: NetProfitabilityCalculator,
  config: IngestionPipelineConfig
): OpportunityEvaluationResult {
  const tradeAmount =
    opp.buyPrice > 0 ? config.baseNotionalUsd / opp.buyPrice : 1.0;

  const analysis = calculator.fromSpreadOpportunity(
    {
      buyExchange: opp.buyExchange,
      sellExchange: opp.sellExchange,
      symbol: opp.symbol,
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      amount: tradeAmount,
      id: opp.id,
    },
    {
      minHurdleBps: config.minHurdleBps,
    }
  );

  const passed =
    analysis.isProfitable === true &&
    analysis.netProfitBps >= config.minHurdleBps - HURDLE_EPSILON_BPS &&
    analysis.netProfitUsd > 0 &&
    !analysis.breakdown?.insufficientLiquidity &&
    analysis.grossSpreadUsd > 0;

  const rejectionReason = passed
    ? undefined
    : analysis.rejectionReason ?? 'BELOW_HURDLE';

  return {
    passed,
    analysis,
    rejectionReason,
  };
}
