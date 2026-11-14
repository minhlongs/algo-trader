/**
 * Top-level Polymarket Governance KPI evaluator.
 *
 * Runs the source-provenance guard first (rejecting `simulateMarketRegimeTick` /
 * `'synthetic-regime'`, `'ohlcv-store'`, and unlabelled inputs) and then computes
 * all 11 governance KPIs in canonical report order (pp. 60–62).
 */

import {
  evaluateAdverseSelectionKpi,
  evaluateBrierCalibrationKpi,
  evaluateCapacityKpi,
  evaluateCapitalUtilizationKpi,
  evaluateCostStressKpi,
  evaluateTailSettlementKpi,
} from './kpi-poly-evaluators-microstructure';
import { evaluateFillRateKpi } from './kpi-poly-evaluators-execution';
import {
  evaluateMaxDrawdownKpi,
  evaluateNetPnlKpi,
  evaluateProfitFactorKpi,
  evaluateSharpeSortinoKpi,
} from './kpi-poly-evaluators-performance';
import { verifyKpiProvenance } from './kpi-poly-source-guard';
import type { KpiEvaluationInput, KpiEvaluationReport, KpiRowResult } from './kpi-poly-types';

export function evaluatePolymarketKpis(
  input: KpiEvaluationInput,
  now: () => Date = () => new Date(),
): KpiEvaluationReport {
  const provenance = verifyKpiProvenance(input.provenance);
  const rows: KpiRowResult[] = [
    evaluateNetPnlKpi(input.performance),
    evaluateSharpeSortinoKpi(input.performance),
    evaluateMaxDrawdownKpi(input.performance),
    evaluateProfitFactorKpi(input.performance),
    evaluateFillRateKpi(input.execution),
    evaluateAdverseSelectionKpi(input.adverseSelection),
    evaluateBrierCalibrationKpi(input.calibration),
    evaluateCapitalUtilizationKpi(input.capital),
    evaluateCostStressKpi(input.stress),
    evaluateCapacityKpi(input.capacity),
    evaluateTailSettlementKpi(input.tailAndSettlement),
  ];

  return {
    generatedAtIso: now().toISOString(),
    provenance,
    rows,
  };
}
