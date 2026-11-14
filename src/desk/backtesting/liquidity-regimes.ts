/**
 * Liquidity Regimes
 *
 * Classifies every observation into exactly one of four liquidity regimes so
 * robustness statistics can be reported per regime instead of only in aggregate.
 *
 * The rule is a two-dimensional grid over the two quantities this repo already
 * measures for a Polymarket book (see desk/market-data/liquidity-score-engine):
 *
 *   spreadBps — quoted spread in basis points of the mid price
 *   depthUsd  — resting notional in USD on both sides within the reference band
 *
 *              | tight spread        | wide spread
 *   -----------+---------------------+-----------------------
 *   deep       | 'abundant'          | 'spread-constrained'
 *   thin       | 'depth-constrained' | 'illiquid'
 *
 * Binary dimensions guarantee the four labels are mutually exclusive and
 * exhaustive: every observation receives exactly one label.
 */

export const LIQUIDITY_REGIMES = [
  'abundant',
  'depth-constrained',
  'spread-constrained',
  'illiquid',
] as const;

export type LiquidityRegime = (typeof LIQUIDITY_REGIMES)[number];

export interface LiquidityObservation {
  /** Quoted spread in basis points of the mid price (e.g. 45 = 0.45%). */
  spreadBps: number;
  /** Resting notional in USD across both sides within the reference band. */
  depthUsd: number;
}

export interface LiquidityRegimeThresholds {
  /**
   * Spread at or above this value is "wide". Default 200 bps (2%), one fifth of
   * the 500 bps reference-max spread used by LiquidityScoreEngine — i.e. a book
   * that would already score zero on spread quality.
   */
  wideSpreadBps: number;
  /**
   * Depth at or below this value is "thin". Default 10_000 USD, one fifth of
   * LiquidityScoreEngine's 50_000 USD reference target depth.
   */
  thinDepthUsd: number;
}

export const DEFAULT_LIQUIDITY_REGIME_THRESHOLDS: LiquidityRegimeThresholds = {
  wideSpreadBps: 200,
  thinDepthUsd: 10_000,
};

/**
 * Classify one observation.
 *
 * NaN is missing data, not a good book, so it is treated as the worst case
 * (wide spread, thin depth) rather than silently scoring well. Infinity is a
 * real value and compares normally: an infinite spread is wide, infinite depth
 * is deep.
 */
export function classifyLiquidityRegime(
  observation: LiquidityObservation,
  thresholds: LiquidityRegimeThresholds = DEFAULT_LIQUIDITY_REGIME_THRESHOLDS,
): LiquidityRegime {
  const { spreadBps, depthUsd } = observation;
  const wide = Number.isNaN(spreadBps) || spreadBps >= thresholds.wideSpreadBps;
  const thin = Number.isNaN(depthUsd) || depthUsd <= thresholds.thinDepthUsd;

  if (wide && thin) return 'illiquid';
  if (wide) return 'spread-constrained';
  if (thin) return 'depth-constrained';
  return 'abundant';
}

/** Classify an ordered series of observations, preserving order. */
export function classifyLiquiditySeries(
  observations: readonly LiquidityObservation[],
  thresholds: LiquidityRegimeThresholds = DEFAULT_LIQUIDITY_REGIME_THRESHOLDS,
): LiquidityRegime[] {
  return observations.map((observation) => classifyLiquidityRegime(observation, thresholds));
}

export interface BookLevelLike {
  readonly price: number;
  readonly quantity: number;
}

/**
 * Resting notional (USD) within `bandPct` of the mid, both sides. Returns the
 * half-notional (one side) so the result is comparable to the 10k USD default
 * thin-depth threshold, which is expressed per side.
 */
export function computeBookDepthUsd(
  bids: readonly BookLevelLike[],
  asks: readonly BookLevelLike[],
  bandPct = 0.02,
): number {
  if (bids.length === 0 || asks.length === 0 || !(bandPct > 0)) return 0;
  const bestBid = Math.max(...bids.map((level) => level.price));
  const bestAsk = Math.min(...asks.map((level) => level.price));
  const mid = (bestBid + bestAsk) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return 0;

  const bidDepth = bids
    .filter((level) => level.price >= mid * (1 - bandPct))
    .reduce((sum, level) => sum + level.price * level.quantity, 0);
  const askDepth = asks
    .filter((level) => level.price <= mid * (1 + bandPct))
    .reduce((sum, level) => sum + level.price * level.quantity, 0);
  return (bidDepth + askDepth) / 2;
}
