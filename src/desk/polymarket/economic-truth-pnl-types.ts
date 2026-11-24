/**
 * Shared types for the 5-Quantity Economic Truth PnL Calculator.
 */

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
  /** Optional observed max drawdown (% of NAV) for risk-adjusted capital return. */
  maxDrawdownPct?: number;
  /** Optional 99% CVaR / worst-case cluster tail loss (% of NAV) for risk-adjusted capital return. */
  tailLossNavPct?: number;
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
  /** 4b. Drawdown/tail-risk-adjusted capital return (%): capitalAdjustedReturnPct / (1 + riskPenaltyPct / 100). */
  riskAdjustedCapitalReturnPct: number;
  /** 5. Linearized annualized return on capital tied up (%) accounting for lockup + UMA dispute days. */
  returnOnCapitalTiedUpPct: number;
  /** 5b. Compound annualized ROC (%): ((1 + edge / (1 - edge))^(365 / effectiveLockupDays) - 1) * 100. */
  compoundAnnualizedRocPct: number;
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
