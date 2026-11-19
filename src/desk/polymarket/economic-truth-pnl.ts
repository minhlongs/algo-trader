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

export const DEFAULT_OPPORTUNITY_COST_ANNUAL_RATE = 0.045;
const DAYS_PER_YEAR = 365;

export interface EconomicPnLInput {
  initialCapitalPusd: number;
  pusdBalance: number;
  executableBidValuePusd: number;
  /** Gross PnL from closed trades before explicit trading costs. */
  grossClosedTradingPnlPusd: number;
  /** Gross PnL realized post-`redeemPositions` on resolved markets. */
  grossSettledPnlPusd: number;
  /** Explicit redemption/settlement cost deducted from settled PnL (default 0). */
  settledRedemptionCostPusd?: number;
  makerRebatesPusd: number;
  liquidityRewardsPusd: number;
  /** Itemized explicit & economic costs (non-negative pUSD). */
  realizedFeesPusd: number;
  estimatedFeesPusd: number;
  slippagePusd: number;
  relayerGasPusd: number;
  inferenceCostPusd: number;
  infraCostPusd: number;
  /** Average capital locked in open/unsettled positions (pUSD). */
  lockedCapitalPusd: number;
  /** Weighted-average capital lockup duration in days. */
  weightedAvgLockupDays: number;
  /** Additional UMA dispute lockup buffer in days (default 0). */
  umaDisputeLockupDays?: number;
  /** Annual opportunity cost rate on locked capital (default 0.045 = 4.5%/yr). */
  opportunityCostAnnualRate?: number;
  /** Optional explicit override for base opportunity cost (pUSD). */
  opportunityCostPusd?: number;
  /** Optional explicit override for UMA dispute lockup cost (pUSD). */
  umaDisputeLockupCostPusd?: number;
  /** Total allocated capital denominator for capitalAdjustedReturnPct (default initialCapitalPusd). */
  totalAllocatedCapitalPusd?: number;
}

export interface EconomicPnLItemizedCosts {
  realizedFeesPusd: number;
  estimatedFeesPusd: number;
  slippagePusd: number;
  relayerGasPusd: number;
  inferenceCostPusd: number;
  infraCostPusd: number;
  opportunityCostPusd: number;
  umaDisputeLockupCostPusd: number;
  totalCostsPusd: number;
}

export interface EconomicPnLBreakdown {
  /** 1. Mark-to-market PnL: `pUSD + Executable Bid Value - initialCapital`. */
  mtmPnlPusd: number;
  /** 2. Realized trading PnL: closed trades net of explicit trading fees & slippage. */
  realizedTradingPnlPusd: number;
  /** 3. Settled PnL: post-`redeemPositions` on resolved markets. */
  settledPnlPusd: number;
  /** 4. Capital-adjusted return (%): net economic PnL / total allocated capital * 100. */
  capitalAdjustedReturnPct: number;
  /** 5. Annualized return on capital tied up (%) accounting for lockup + UMA dispute days. */
  returnOnCapitalTiedUpPct: number;
  /** Gross trading + rebates + rewards minus all itemized costs. */
  netEconomicPnlPusd: number;
  /** Strictly excludes liquidity rewards to expose rewards dependency. */
  netEconomicPnlExRewardsPusd: number;
  /** True when positive economic PnL depends on liquidity rewards. */
  isRewardsDependent: boolean;
  effectiveLockupDays: number;
  opportunityCostAnnualRate: number;
  costs: EconomicPnLItemizedCosts;
}

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

  const capitalAdjustedReturnPct =
    allocatedCapitalPusd > 0 ? (netEconomicPnlPusd / allocatedCapitalPusd) * 100 : 0;

  const effectiveLockupDays = input.weightedAvgLockupDays + umaDisputeLockupDays;
  const returnOnCapitalTiedUpPct =
    input.lockedCapitalPusd > 0 && effectiveLockupDays > 0
      ? (netEconomicPnlPusd / input.lockedCapitalPusd) * (DAYS_PER_YEAR / effectiveLockupDays) * 100
      : 0;

  return {
    mtmPnlPusd: round4(mtmPnlPusd),
    realizedTradingPnlPusd: round4(realizedTradingPnlPusd),
    settledPnlPusd: round4(settledPnlPusd),
    capitalAdjustedReturnPct: round4(capitalAdjustedReturnPct),
    returnOnCapitalTiedUpPct: round4(returnOnCapitalTiedUpPct),
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
