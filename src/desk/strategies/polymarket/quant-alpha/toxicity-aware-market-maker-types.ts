/**
 * Toxicity-Aware Market Maker — parameter surface.
 *
 * Everything the report pins numerically lives here as a field, so a backtest
 * can sweep it and no number is baked into the scan path. `BaseStrategyConfig`
 * fields (minVolume, takeProfitPct, stopLossPct, maxHoldMs, maxPositions,
 * cooldownMs, positionSize) stay last so a caller can override the base fields
 * unchanged.
 */

import type { StrategyName } from '../../../core/types';
import type { BaseStrategyConfig } from '../base-polymarket-strategy';

/** Which side of the touch a post-only quote is written on. */
export type QuotePlacement = 'touch' | 'one-tick-inside';

export interface ToxicityAwareConfig extends BaseStrategyConfig {
  /** Depth levels scanned for order-flow toxicity. */
  toxicityDepthLevels: number;
  /** VPIN above this value vetoes a two-sided quote. */
  maxToxicityVpin: number;
  /** Trade-imbalance z-score above this magnitude vetoes a quote. */
  maxToxicityZScore: number;
  /** Samples kept per token for the toxicity z-score. */
  toxicityLookback: number;
  /** Quote offset from mid in ticks (always inward: bid = mid - δ, ask-side mirror). */
  quoteTicks: number;
  /** Placement of the quote relative to the visible touch. */
  quotePlacement: QuotePlacement;
  /**
   * Hard cap on the cash collateral released for one YES+NO pair: the pair must
   * cost strictly less than 1.00 pUSD or the strategy declines to quote.
   */
  maxPairCostPusd: number;
  /** Notional per leg in pUSD. */
  legNotionalPusd: number;
  /** Post-only quote lifetime in ms — the report's 5 s heartbeat. */
  quoteRefreshMs: number;
  /** Requote tolerance in ticks: requote only when the fair price moved further. */
  requoteToleranceTicks: number;
  /** Combined balance (pUSD) above which the pair is merged back to collateral. */
  mergeThresholdPusd: number;
  /** Daily loss fraction that switches the strategy off. */
  dailyLossLimitPct: number;
  /** One-directional fills per minute with negative markout that trip the kill. */
  maxOneDirectionalFillsPerMin: number;
  /** Markout horizon for the one-directional-fill check, ms. */
  markoutHorizonMs: number;
  /** Refuse to quote when the market is closer to expiry than this, ms. */
  minTimeToExpiryMs: number;
  /** Order type used for the resting quotes. */
  quoteOrderType: 'GTC' | 'GTD';
  /** Liquidity charge per leg at which quotes widen to SKU-capped size. */
  skuCapShares: number;
  /** Top fraction of the (Reward+Rebate)/RealizedVolatility ranking to quote. */
  marketSelectionTopFraction: number;
  /** Realized-volatility lookback in ticks. */
  volatilityLookback: number;
  /** Annualisation-free scale the report uses for realized volatility. */
  volatilityScale: number;
  /** Market's price tick. No desk-layer API exposes it, so it is parameterised. */
  tickSize: number;
}

export const DEFAULT_CONFIG: ToxicityAwareConfig = {
  toxicityDepthLevels: 10,
  maxToxicityVpin: 0.6,
  maxToxicityZScore: 2.0,
  toxicityLookback: 40,
  quoteTicks: 1,
  quotePlacement: 'touch',
  maxPairCostPusd: 0.99,
  legNotionalPusd: 20,
  quoteRefreshMs: 5_000,
  requoteToleranceTicks: 1,
  mergeThresholdPusd: 20,
  dailyLossLimitPct: 0.015,
  maxOneDirectionalFillsPerMin: 3,
  markoutHorizonMs: 10_000,
  minTimeToExpiryMs: 30 * 60_000,
  quoteOrderType: 'GTC',
  skuCapShares: 5,
  marketSelectionTopFraction: 0.2,
  volatilityLookback: 30,
  volatilityScale: 1,
  tickSize: 0.01,
  minVolume: 1000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 6 * 60 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '20',
};

export const STRATEGY_NAME: StrategyName = 'toxicity-aware-market-maker';

/** A cash-collateralised pair quote: both legs may be bought for under 1.00 pUSD. */
export interface PairQuote {
  tokenId: string;
  /** NO token id — the second leg. Both legs are BUYs of distinct ERC-1155 tokens. */
  noTokenId: string;
  conditionId: string;
  fairMid: number;
  yesBidPrice: number;
  yesNotionalPusd: number;
  noBidPrice: number;
  noNotionalPusd: number;
  pairCostPusd: number;
  rewardPlusRebate: number;
  realizedVol: number;
  rankScore: number;
}
