/**
 * Machine-Readable 11-KPI Investment Committee Scorecard (IC PDF pp. 59-62).
 *
 * Fail-closed governance: whenever empirical sample floors are unmet
 * (`recordedL2Days < 30`, `qualifyingMakerFills < 500`, or `resolvedOosForecasts < 150`),
 * all empirical KPIs output `UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE` and
 * governance gates lock to `INSUFFICIENT_DATA` / `HOLD` / `DISABLED`.
 */

export const UNKNOWN_EMPIRICAL_LABEL = 'UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE';
export const MIN_RECORDED_L2_DAYS = 30;
export const MIN_QUALIFYING_MAKER_FILLS = 500;
export const MIN_RESOLVED_OOS_FORECASTS = 150;

export type ICKpiStatus = 'PASS' | 'FAIL' | 'UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE';

export interface ICKpiMetricResult {
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  name: string;
  status: ICKpiStatus;
  label: string;
  observed: string;
  threshold: string;
  detail: string;
}

export type FinalVerdictKey =
  | 'ARCHITECTURE_PARITY'
  | 'L2_CAPTURE_READINESS'
  | '30_DAY_L2_DATA'
  | 'MAKER_ALPHA'
  | 'NEGRISK_ALPHA'
  | 'MARKET_BLIND_ALPHA'
  | 'ECONOMIC_G11'
  | 'LEGAL_G12'
  | 'FOUNDER_G13'
  | 'REAL_MONEY_TRADING';

export type FinalVerdictValue = 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA' | 'GO' | 'HOLD' | 'DISABLED' | 'ENABLED';

export interface ICEmpiricalSamples {
  recordedL2Days: number;
  qualifyingMakerFills: number;
  resolvedOosForecasts: number;
}

export interface ICScorecardInput {
  generatedAtIso?: string;
  mode: 'sim' | 'pilot';
  strategyClass: 'mm' | 'event';
  samples: ICEmpiricalSamples;
  netPnlBootstrapCiLowerPusd?: number;
  sortinoRatio?: number;
  /** Annualized deflated Sharpe (>= 1.5 per IC PDF p. 59) OR pass `deflatedSharpeProbability` (>= 0.95). */
  deflatedSharpe?: number;
  deflatedSharpeProbability?: number;
  maxDrawdownMtmPct?: number;
  profitFactor?: number;
  fillRateDivergencePct?: number;
  multiLegCompletionPct?: number;
  realizedSpread60sPlusRebateRewardBps?: number;
  bssOos?: number;
  ece?: number;
  weightedAvgLockupDays?: number;
  lockedCapitalPct?: number;
  stress15xSlippageNetPnlPusd?: number;
  stress15xCancelLatencyNetPnlPusd?: number;
  stressMinus50PctRewardsNetPnlPusd?: number;
  deployableCapacityPusd?: number;
  clusterWorstCaseLossNavPct?: number;
  ghostFillCount?: number;
  maxTokenDrift?: number;
  architectureParityPassed?: boolean;
  l2CaptureReady?: boolean;
  legalG12Approved?: boolean;
  founderG13Approved?: boolean;
}

export interface ICScorecardReport {
  generatedAtIso: string;
  empiricalSampleGatePassed: boolean;
  samples: ICEmpiricalSamples;
  kpis: ICKpiMetricResult[];
  verdicts: Record<FinalVerdictKey, FinalVerdictValue>;
}

const finite = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function buildKpi(
  id: ICKpiMetricResult['id'],
  name: string,
  threshold: string,
  hasEmpirical: boolean,
  samples: ICEmpiricalSamples,
  passed: boolean,
  observed: string,
  detail: string,
): ICKpiMetricResult {
  if (!hasEmpirical) {
    return {
      id, name, status: 'UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE', label: UNKNOWN_EMPIRICAL_LABEL,
      observed: UNKNOWN_EMPIRICAL_LABEL, threshold,
      detail: `Sample floor unmet (L2=${samples.recordedL2Days}/${MIN_RECORDED_L2_DAYS}d, fills=${samples.qualifyingMakerFills}/${MIN_QUALIFYING_MAKER_FILLS}, OOS=${samples.resolvedOosForecasts}/${MIN_RESOLVED_OOS_FORECASTS})`,
    };
  }
  return { id, name, status: passed ? 'PASS' : 'FAIL', label: passed ? 'PASS' : 'FAIL', observed, threshold, detail };
}

export function evaluateICKpiScorecard(input: ICScorecardInput): ICScorecardReport {
  const { samples: s } = input;
  const okEmp =
    s.recordedL2Days >= MIN_RECORDED_L2_DAYS &&
    s.qualifyingMakerFills >= MIN_QUALIFYING_MAKER_FILLS &&
    s.resolvedOosForecasts >= MIN_RESOLVED_OOS_FORECASTS;
  const ddMax = input.mode === 'pilot' ? 2.5 : 4.0;
  const pfMin = input.strategyClass === 'event' ? 1.6 : 1.35;

  const k1 = finite(input.netPnlBootstrapCiLowerPusd) && input.netPnlBootstrapCiLowerPusd > 0;
  const dsrPass =
    (finite(input.deflatedSharpeProbability) && input.deflatedSharpeProbability >= 0.95) ||
    (finite(input.deflatedSharpe) && input.deflatedSharpe >= 1.5);
  const k2 = finite(input.sortinoRatio) && input.sortinoRatio >= 2.0 && dsrPass;
  const k3 = finite(input.maxDrawdownMtmPct) && input.maxDrawdownMtmPct >= 0 && input.maxDrawdownMtmPct < ddMax;
  const k4 = finite(input.profitFactor) && input.profitFactor >= pfMin;
  const k5 = finite(input.fillRateDivergencePct) && finite(input.multiLegCompletionPct) && input.fillRateDivergencePct >= 0 && input.fillRateDivergencePct < 20 && input.multiLegCompletionPct >= 92;
  const k6 = finite(input.realizedSpread60sPlusRebateRewardBps) && input.realizedSpread60sPlusRebateRewardBps >= 15 && s.qualifyingMakerFills >= MIN_QUALIFYING_MAKER_FILLS;
  const k7 = finite(input.bssOos) && finite(input.ece) && input.bssOos >= 0.02 && input.ece >= 0 && input.ece < 0.035 && s.resolvedOosForecasts >= MIN_RESOLVED_OOS_FORECASTS;
  const k8 = finite(input.weightedAvgLockupDays) && finite(input.lockedCapitalPct) && input.weightedAvgLockupDays >= 0 && input.weightedAvgLockupDays < 10 && input.lockedCapitalPct >= 0 && input.lockedCapitalPct < 25;
  const k9 = finite(input.stress15xSlippageNetPnlPusd) && finite(input.stress15xCancelLatencyNetPnlPusd) && finite(input.stressMinus50PctRewardsNetPnlPusd) && input.stress15xSlippageNetPnlPusd > 0 && input.stress15xCancelLatencyNetPnlPusd > 0 && input.stressMinus50PctRewardsNetPnlPusd > 0;
  const k10 = finite(input.deployableCapacityPusd) && input.deployableCapacityPusd >= 25_000;
  const k11 = finite(input.clusterWorstCaseLossNavPct) && finite(input.ghostFillCount) && finite(input.maxTokenDrift) && input.clusterWorstCaseLossNavPct >= 0 && input.clusterWorstCaseLossNavPct < 3.0 && input.ghostFillCount === 0 && input.maxTokenDrift >= 0 && input.maxTokenDrift <= 1;

  const kpis: ICKpiMetricResult[] = [
    buildKpi(1, 'Net PnL 95% Bootstrap CI LB', '> 0 pUSD', okEmp, s, k1, `${input.netPnlBootstrapCiLowerPusd ?? 'n/a'} pUSD`, k1 ? 'CI lower bound positive' : 'CI lower bound <= 0'),
    buildKpi(2, 'Sortino & Deflated Sharpe', 'Sortino >= 2.0 & DSR >= 1.5', okEmp, s, k2, `Sortino=${input.sortinoRatio ?? 'n/a'}, DSR=${input.deflatedSharpe ?? 'n/a'}`, k2 ? 'Risk-adjusted met' : 'Below Sortino or DSR floor'),
    buildKpi(3, 'Max Drawdown (MTM)', `< ${ddMax.toFixed(1)}% (${input.mode})`, okEmp, s, k3, `${input.maxDrawdownMtmPct ?? 'n/a'}%`, k3 ? 'Within MTM drawdown ceiling' : 'Exceeds MTM drawdown ceiling'),
    buildKpi(4, 'Profit Factor', `>= ${pfMin.toFixed(2)} (${input.strategyClass})`, okEmp, s, k4, `${input.profitFactor ?? 'n/a'}`, k4 ? 'Profit factor met' : 'Below profit factor floor'),
    buildKpi(5, 'Fill Rate & Multi-Leg Completion', 'div < 20% & multi-leg >= 92%', okEmp, s, k5, `div=${input.fillRateDivergencePct ?? 'n/a'}%, multiLeg=${input.multiLegCompletionPct ?? 'n/a'}%`, k5 ? 'Execution fidelity met' : 'Fill divergence or leg completion failed'),
    buildKpi(6, 'Adverse Selection (60s Spread+Rebate+Reward)', '>= +15 bps over >= 500 fills', okEmp, s, k6, `${input.realizedSpread60sPlusRebateRewardBps ?? 'n/a'} bps`, k6 ? 'Positive net markout spread' : 'Adverse selection edge below +15 bps'),
    buildKpi(7, 'Brier / Calibration (BSS_OOS & ECE)', 'BSS_OOS >= +0.02 & ECE < 0.035 (>=150 OOS)', okEmp, s, k7, `BSS=${input.bssOos ?? 'n/a'}, ECE=${input.ece ?? 'n/a'}`, k7 ? 'Calibration edge confirmed' : 'Calibration below threshold'),
    buildKpi(8, 'Capital Utilization', 'avg lockup < 10d & locked < 25%', okEmp, s, k8, `lockup=${input.weightedAvgLockupDays ?? 'n/a'}d, locked=${input.lockedCapitalPct ?? 'n/a'}%`, k8 ? 'Capital velocity healthy' : 'Capital lockup exceeds threshold'),
    buildKpi(9, 'Turnover & Cost Stress', 'net PnL > 0 at 1.5x slip/cancel & -50% rewards', okEmp, s, k9, `slip=${input.stress15xSlippageNetPnlPusd ?? 'n/a'}, cancel=${input.stress15xCancelLatencyNetPnlPusd ?? 'n/a'}, rew=${input.stressMinus50PctRewardsNetPnlPusd ?? 'n/a'}`, k9 ? 'Survives cost & reward shocks' : 'Non-positive under stress'),
    buildKpi(10, 'Deployable Capacity', '>= 25,000 pUSD', okEmp, s, k10, `${input.deployableCapacityPusd ?? 'n/a'} pUSD`, k10 ? 'Capacity sufficient' : 'Capacity below 25,000 pUSD'),
    buildKpi(11, 'Tail Loss & Settlement', 'cluster < 3.0% NAV, 0 Ghost Fills, <= 1 token drift', okEmp, s, k11, `cluster=${input.clusterWorstCaseLossNavPct ?? 'n/a'}%, ghost=${input.ghostFillCount ?? 'n/a'}, drift=${input.maxTokenDrift ?? 'n/a'}`, k11 ? 'Tail & settlement clean' : 'Tail loss or settlement drift failed'),
  ];

  const allPass = okEmp && kpis.every((k) => k.status === 'PASS');
  const archVerdict: FinalVerdictValue = input.architectureParityPassed === true ? 'PASS' : 'HOLD';
  const captureVerdict: FinalVerdictValue = input.l2CaptureReady === true ? 'PASS' : 'HOLD';
  const verdicts: Record<FinalVerdictKey, FinalVerdictValue> = !okEmp
    ? {
        ARCHITECTURE_PARITY: archVerdict,
        L2_CAPTURE_READINESS: captureVerdict,
        '30_DAY_L2_DATA': 'INSUFFICIENT_DATA',
        MAKER_ALPHA: 'INSUFFICIENT_DATA',
        NEGRISK_ALPHA: 'INSUFFICIENT_DATA',
        MARKET_BLIND_ALPHA: 'INSUFFICIENT_DATA',
        ECONOMIC_G11: 'HOLD',
        LEGAL_G12: 'HOLD',
        FOUNDER_G13: 'HOLD',
        REAL_MONEY_TRADING: 'DISABLED',
      }
    : {
        ARCHITECTURE_PARITY: archVerdict,
        L2_CAPTURE_READINESS: captureVerdict,
        '30_DAY_L2_DATA': 'PASS',
        MAKER_ALPHA: k1 && k4 && k6 ? 'PASS' : 'FAIL',
        NEGRISK_ALPHA: k1 && k5 && k8 ? 'PASS' : 'FAIL',
        MARKET_BLIND_ALPHA: k7 ? 'PASS' : 'FAIL',
        ECONOMIC_G11: allPass ? 'GO' : 'HOLD',
        LEGAL_G12: input.legalG12Approved === true ? 'GO' : 'HOLD',
        FOUNDER_G13: input.founderG13Approved === true ? 'GO' : 'HOLD',
        REAL_MONEY_TRADING: allPass && input.legalG12Approved === true && input.founderG13Approved === true ? 'ENABLED' : 'DISABLED',
      };

  return {
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
    empiricalSampleGatePassed: okEmp,
    samples: s,
    kpis,
    verdicts,
  };
}
