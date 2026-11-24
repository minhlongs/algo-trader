/**
 * Canonical 5-Quantity Economic Truth PnL Calculator (IC PDF pp. 30, 32-33).
 *
 * Strictly separates:
 *  1. MTM PnL (`pUSD + Executable Bid Value - initialCapital`)
 *  2. Realized Trading PnL (closed trades net of explicit trading costs)
 *  3. Settled PnL (post-`redeemPositions` on resolved markets)
 *  4. Capital-Adjusted Return (%)
 *  5. Annualized Return on Capital Tied Up (%) including UMA dispute lockup buffer
 *
 * Exposes liquidity rewards dependency via `netEconomicPnlExRewardsPusd`.
 */

import type {
  EconomicPnLBreakdown,
  EconomicPnLInput,
  EconomicPnLItemizedCosts,
} from './economic-truth-pnl-types';

export type { EconomicPnLBreakdown, EconomicPnLInput, EconomicPnLItemizedCosts };

export const DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE = 0.045;
const DAYS_PER_YEAR = 365;

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`EconomicPnLInput.${name} must be a finite number`);
  }
}

function assertNonNegative(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0) {
    throw new RangeError(`EconomicPnLInput.${name} must be non-negative`);
  }
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function computeCanonicalEconomicPnL(input: EconomicPnLInput): EconomicPnLBreakdown {
  assertNonNegative('initialCapitalPusd', input.initialCapitalPusd);
  assertFinite('pusdBalance', input.pusdBalance);
  assertNonNegative('executableBidValuePusd', input.executableBidValuePusd);
  assertFinite('grossClosedTradingPnlPusd', input.grossClosedTradingPnlPusd);
  assertFinite('grossSettledPnlPusd', input.grossSettledPnlPusd);
  assertNonNegative('makerRebatesPusd', input.makerRebatesPusd);
  assertNonNegative('liquidityRewardsPusd', input.liquidityRewardsPusd);
  assertNonNegative('realizedFeesPusd', input.realizedFeesPusd);
  assertNonNegative('estimatedFeesPusd', input.estimatedFeesPusd);
  assertNonNegative('slippagePusd', input.slippagePusd);
  assertNonNegative('relayerGasPusd', input.relayerGasPusd);
  assertNonNegative('inferenceCostPusd', input.inferenceCostPusd);
  assertNonNegative('infraCostPusd', input.infraCostPusd);
  assertNonNegative('lockedCapitalPusd', input.lockedCapitalPusd);
  assertNonNegative('weightedAvgLockupDays', input.weightedAvgLockupDays);

  const settledRedemptionCostPusd = input.settledRedemptionCostPusd ?? 0;
  const umaDisputeLockupDays = input.umaDisputeLockupDays ?? 0;
  const annualRate = input.opportunityCostAnnualRate ?? DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE;
  const allocatedCapitalPusd = input.totalAllocatedCapitalPusd ?? input.initialCapitalPusd;

  assertNonNegative('settledRedemptionCostPusd', settledRedemptionCostPusd);
  assertNonNegative('umaDisputeLockupDays', umaDisputeLockupDays);
  assertNonNegative('opportunityCostAnnualRate', annualRate);
  assertNonNegative('totalAllocatedCapitalPusd', allocatedCapitalPusd);

  const opportunityCostPusd =
    input.opportunityCostPusd ??
    input.lockedCapitalPusd * annualRate * (input.weightedAvgLockupDays / DAYS_PER_YEAR);
  const umaDisputeLockupCostPusd =
    input.umaDisputeLockupCostPusd ??
    input.lockedCapitalPusd * annualRate * (umaDisputeLockupDays / DAYS_PER_YEAR);

  assertNonNegative('opportunityCostPusd', opportunityCostPusd);
  assertNonNegative('umaDisputeLockupCostPusd', umaDisputeLockupCostPusd);

  const totalCostsPusd =
    input.realizedFeesPusd +
    input.estimatedFeesPusd +
    input.slippagePusd +
    input.relayerGasPusd +
    input.inferenceCostPusd +
    input.infraCostPusd +
    opportunityCostPusd +
    umaDisputeLockupCostPusd;

  const mtmPnlPusd = input.pusdBalance + input.executableBidValuePusd - input.initialCapitalPusd;
  const realizedTradingPnlPusd =
    input.grossClosedTradingPnlPusd - input.realizedFeesPusd - input.slippagePusd;
  const settledPnlPusd = input.grossSettledPnlPusd - settledRedemptionCostPusd;

  const netEconomicPnlPusd =
    input.grossClosedTradingPnlPusd + settledPnlPusd + input.makerRebatesPusd + input.liquidityRewardsPusd - totalCostsPusd;
  const netEconomicPnlExRewardsPusd =
    input.grossClosedTradingPnlPusd + settledPnlPusd + input.makerRebatesPusd - totalCostsPusd;

  const maxDrawdownPct = input.maxDrawdownPct ?? 0;
  const tailLossNavPct = input.tailLossNavPct ?? 0;
  assertNonNegative('maxDrawdownPct', maxDrawdownPct);
  assertNonNegative('tailLossNavPct', tailLossNavPct);

  const capitalAdjustedReturnPct =
    allocatedCapitalPusd > 0 ? (netEconomicPnlPusd / allocatedCapitalPusd) * 100 : 0;
  const riskPenaltyPct = Math.max(maxDrawdownPct, tailLossNavPct);
  const riskAdjustedCapitalReturnPct = capitalAdjustedReturnPct / (1 + riskPenaltyPct / 100);

  const effectiveLockupDays = input.weightedAvgLockupDays + umaDisputeLockupDays;
  const returnOnCapitalTiedUpPct =
    input.lockedCapitalPusd > 0 && effectiveLockupDays > 0
      ? (netEconomicPnlPusd / input.lockedCapitalPusd) * (DAYS_PER_YEAR / effectiveLockupDays) * 100
      : 0;
  const edge = input.lockedCapitalPusd > 0 ? netEconomicPnlPusd / input.lockedCapitalPusd : 0;
  const rawCompoundAnnualizedRocPct =
    input.lockedCapitalPusd > 0 && effectiveLockupDays > 0 && edge > -1 && edge < 1
      ? (Math.pow(1 + edge / (1 - edge), DAYS_PER_YEAR / effectiveLockupDays) - 1) * 100
      : returnOnCapitalTiedUpPct;
  const compoundAnnualizedRocPct = Number.isFinite(rawCompoundAnnualizedRocPct)
    ? rawCompoundAnnualizedRocPct
    : returnOnCapitalTiedUpPct;

  return {
    mtmPnlPusd: round4(mtmPnlPusd),
    realizedTradingPnlPusd: round4(realizedTradingPnlPusd),
    settledPnlPusd: round4(settledPnlPusd),
    capitalAdjustedReturnPct: round4(capitalAdjustedReturnPct),
    riskAdjustedCapitalReturnPct: round4(riskAdjustedCapitalReturnPct),
    returnOnCapitalTiedUpPct: round4(returnOnCapitalTiedUpPct),
    compoundAnnualizedRocPct: round4(compoundAnnualizedRocPct),
    netEconomicPnlPusd: round4(netEconomicPnlPusd),
    netEconomicPnlExRewardsPusd: round4(netEconomicPnlExRewardsPusd),
    isRewardsDependent: netEconomicPnlPusd > 0 && netEconomicPnlExRewardsPusd <= 0,
    effectiveLockupDays: round4(effectiveLockupDays),
    opportunityCostAnnualRate: annualRate,
    costs: {
      realizedFeesPusd: round4(input.realizedFeesPusd),
      estimatedFeesPusd: round4(input.estimatedFeesPusd),
      slippagePusd: round4(input.slippagePusd),
      relayerGasPusd: round4(input.relayerGasPusd),
      inferenceCostPusd: round4(input.inferenceCostPusd),
      infraCostPusd: round4(input.infraCostPusd),
      opportunityCostPusd: round4(opportunityCostPusd),
      umaDisputeLockupCostPusd: round4(umaDisputeLockupCostPusd),
      totalCostsPusd: round4(totalCostsPusd),
    },
  };
}
