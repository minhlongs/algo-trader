/**
 * IC Resolution `--stress` Shock Transformer for Polymarket Governance KPIs (pp. 57–62).
 *
 * Applies:
 *  - `1.5x` slippage & cancel-latency multiplier (widening venue/slippage drag by +50%
 *    and degrading maker queue fill reach under 1.5x cancel latency),
 *  - `50%` haircut on Liquidity Rewards (`liquidityRewardBps * 0.5`),
 *  - explicit `4.5%/yr` locked-capital opportunity carry deduction on cycles & equity curve.
 */

import {
  KPI_THRESHOLDS,
  type KpiClosedCycle,
  type KpiEvaluationInput,
  type KpiMakerMarkoutSample,
  type KpiStressModeSummary,
} from './kpi-poly-types';

export interface StressShockOptions {
  readonly slippageCancelLatencyMultiplier?: number;
  readonly liquidityRewardHaircutFraction?: number;
  readonly annualLockedCapitalCarryRate?: number;
}

export function buildStressModeSummary(
  enabled: boolean,
  options: StressShockOptions = {},
): KpiStressModeSummary {
  return {
    enabled,
    slippageCancelLatencyMultiplier:
      options.slippageCancelLatencyMultiplier ?? KPI_THRESHOLDS.COST_LATENCY_STRESS_MULTIPLIER,
    liquidityRewardHaircutFraction:
      options.liquidityRewardHaircutFraction ?? KPI_THRESHOLDS.STRESS_LIQUIDITY_REWARD_HAIRCUT,
    annualLockedCapitalCarryRate:
      options.annualLockedCapitalCarryRate ?? KPI_THRESHOLDS.LOCKED_CAPITAL_OPP_COST_ANNUAL,
  };
}

/** Transforms a baseline `KpiEvaluationInput` into its deterministic `--stress` counterpart. */
export function applyIcStressShocks(
  input: KpiEvaluationInput,
  options: StressShockOptions = {},
): KpiEvaluationInput {
  const mult = options.slippageCancelLatencyMultiplier ?? KPI_THRESHOLDS.COST_LATENCY_STRESS_MULTIPLIER;
  const rewardKeep = 1 - (options.liquidityRewardHaircutFraction ?? KPI_THRESHOLDS.STRESS_LIQUIDITY_REWARD_HAIRCUT);
  const carryRate = options.annualLockedCapitalCarryRate ?? KPI_THRESHOLDS.LOCKED_CAPITAL_OPP_COST_ANNUAL;

  const avgLockupDays = Math.max(0, input.capital.weightedAvgLockupDays ?? 7);
  const perCycleCarryFraction = carryRate * (avgLockupDays / 365);

  let cumulativeExtraDrag = 0;
  const stressedCycles: KpiClosedCycle[] = input.performance.closedCycles.map((cycle) => {
    const extraCost = cycle.feeAndSlippagePusd * (mult - 1);
    const carryCost = cycle.notionalPusd * perCycleCarryFraction;
    const stressedFeeSlippage = cycle.feeAndSlippagePusd * mult;
    cumulativeExtraDrag += extraCost + carryCost;
    return {
      ...cycle,
      netPnlPusd: cycle.netPnlPusd - extraCost - carryCost,
      feeAndSlippagePusd: stressedFeeSlippage,
    };
  });

  const curveLen = input.performance.equityCurve.length;
  const stressedCurve = input.performance.equityCurve.map((pt, idx) => {
    const frac = curveLen > 1 ? idx / (curveLen - 1) : 1;
    return {
      timestamp: pt.timestamp,
      equity: pt.equity - cumulativeExtraDrag * frac,
    };
  });

  const stressedMarkouts: KpiMakerMarkoutSample[] = input.adverseSelection.markouts.map((m) => {
    const isBuy = m.side === 'buy' || m.side === 'yes';
    const rawSigned = isBuy ? m.midAt60s - m.fillPrice : m.fillPrice - m.midAt60s;
    const adverseShock = rawSigned < 0 ? Math.abs(rawSigned) * (mult - 1) : 0;
    const stressedMid60s = isBuy ? m.midAt60s - adverseShock : m.midAt60s + adverseShock;
    return {
      ...m,
      midAt60s: stressedMid60s,
      liquidityRewardBps: m.liquidityRewardBps * rewardKeep,
    };
  });

  const stressedSimFillRate =
    input.execution.simMakerFillRate !== null ? input.execution.simMakerFillRate / mult : null;

  const stressedBaseline =
    stressedCycles.length > 0 ? stressedCycles.reduce((s, c) => s + c.netPnlPusd, 0) : input.stress.baselineNetPnlPusd;
  const furtherHalfFee =
    stressedCycles.length > 0
      ? stressedCycles.reduce((s, c) => s + c.feeAndSlippagePusd * (mult - 1), 0)
      : 0;

  return {
    ...input,
    performance: {
      ...input.performance,
      equityCurve: stressedCurve,
      closedCycles: stressedCycles,
    },
    execution: {
      ...input.execution,
      simMakerFillRate: stressedSimFillRate,
    },
    adverseSelection: {
      markouts: stressedMarkouts,
    },
    stress: {
      baselineNetPnlPusd: stressedBaseline,
      stressed15xNetPnlPusd: stressedBaseline !== null ? stressedBaseline - furtherHalfFee : null,
      plusHalfCentSlippageNetPnlPusd:
        input.stress.plusHalfCentSlippageNetPnlPusd !== null
          ? input.stress.plusHalfCentSlippageNetPnlPusd - cumulativeExtraDrag
          : null,
    },
  };
}
