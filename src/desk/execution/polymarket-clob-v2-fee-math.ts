/**
 * Polymarket CLOB V2 quadratic fee, maker rebate, share-deduction parity, and
 * liquidity reward scoring math (plus legacy linear curve helpers).
 */

import {
  CLOB_V2_MAX_BASE_FEE_BPS,
  CLOB_V2_QUADRATIC_RATES,
  FEE_SCHEDULES,
  type PolymarketCategory,
} from './polymarket-clob-v2-fee-categories';

/** Legacy linear fee estimator (kept for backwards-compatible backtest suite). */
export function calcTakerFee(category: PolymarketCategory, probability: number): number {
  const schedule = FEE_SCHEDULES[category];
  if (schedule.exempt) return 0;
  const distance = Math.abs(probability - 0.5);
  const ratio = Math.min(distance / 0.5, 1.0);
  return schedule.minTakerFee + (schedule.maxTakerFee - schedule.minTakerFee) * ratio;
}

/**
 * CLOB V2 quadratic taker fee rate per share: r_cat * p * (1 - p), capped at 10% (base_fee = 1000 bps).
 * Makers (`postOnly = true`) always pay 0%.
 */
export function calcQuadraticTakerFeeRateV2(
  category: PolymarketCategory,
  probability: number,
  postOnly = false,
): number {
  if (postOnly || !Number.isFinite(probability)) return 0;
  const p = Math.max(0, Math.min(1, probability));
  const { rCat } = CLOB_V2_QUADRATIC_RATES[category];
  if (rCat <= 0) return 0;
  const rawRate = rCat * p * (1 - p);
  return Math.min(rawRate, CLOB_V2_MAX_BASE_FEE_BPS / 10_000);
}

/** CLOB V2 quadratic taker fee in pUSD for `contracts` shares at `probability` price. */
export function calcQuadraticTakerFeeV2(
  category: PolymarketCategory,
  probability: number,
  contracts: number,
  postOnly = false,
): number {
  if (postOnly || contracts <= 0) return 0;
  return contracts * calcQuadraticTakerFeeRateV2(category, probability, false);
}

/** CLOB V2 maker rebate in pUSD when a passive order is filled by a taker. */
export function calcMakerRebateV2(
  category: PolymarketCategory,
  probability: number,
  contracts: number,
): number {
  const takerFee = calcQuadraticTakerFeeV2(category, probability, contracts, false);
  return takerFee * CLOB_V2_QUADRATIC_RATES[category].makerRebatePct;
}

/**
 * Net outcome shares and mergeable pair count after CLOB V2 Taker-BUY share deduction.
 */
export interface TakerBuyParityBreakdown {
  requestedPairs: number;
  yesFeeRate: number;
  noFeeRate: number;
  yesNetShares: number;
  noNetShares: number;
  mergeablePairs: number;
  grossUpYesShares: number;
  grossUpNoShares: number;
  canMergeFullRequestedPairs: boolean;
}

export function computeTakerBuyNetSharesAndMergeablePairs(
  requestedPairs: number,
  yesAsk: number,
  noAsk: number,
  category: PolymarketCategory,
): TakerBuyParityBreakdown {
  const safePairs = Math.max(0, requestedPairs);
  const yesFeeRate = calcQuadraticTakerFeeRateV2(category, yesAsk, false);
  const noFeeRate = calcQuadraticTakerFeeRateV2(category, noAsk, false);
  const yesNetShares = safePairs * (1 - yesFeeRate);
  const noNetShares = safePairs * (1 - noFeeRate);
  const mergeablePairs = Math.min(yesNetShares, noNetShares);
  const grossUpYesShares = yesFeeRate < 1 ? Math.ceil(safePairs / (1 - yesFeeRate)) : Infinity;
  const grossUpNoShares = noFeeRate < 1 ? Math.ceil(safePairs / (1 - noFeeRate)) : Infinity;
  const canMergeFullRequestedPairs = mergeablePairs >= safePairs - 1e-9;

  return {
    requestedPairs: safePairs,
    yesFeeRate,
    noFeeRate,
    yesNetShares,
    noNetShares,
    mergeablePairs,
    grossUpYesShares,
    grossUpNoShares,
    canMergeFullRequestedPairs,
  };
}

export interface LiquidityRewardScoreInput {
  maxIncentiveSpread: number;
  bidDistanceFromMid: number;
  askDistanceFromMid: number;
  bidSizeShares: number;
  askSizeShares: number;
  midProbability: number;
  inGameMultiplier?: number;
  singleSidedPenaltyDivisor?: number;
}

/**
 * CLOB V2 quadratic liquidity reward score S(v, s) = ((v - s) / v)^2 * b
 * with two-sided depth rule Q = max(min(Q_bid, Q_ask), max(Q_bid, Q_ask) / c) for p in [0.10, 0.90].
 */
export function calcLiquidityRewardScoreV2(input: LiquidityRewardScoreInput): {
  bidScorePerShare: number;
  askScorePerShare: number;
  effectiveWeightedScore: number;
} {
  const v = input.maxIncentiveSpread;
  const b = input.inGameMultiplier ?? 1.0;
  const c = input.singleSidedPenaltyDivisor ?? 3.0;
  if (v <= 0) return { bidScorePerShare: 0, askScorePerShare: 0, effectiveWeightedScore: 0 };

  const scoreAt = (s: number): number => {
    if (s < 0 || s >= v) return 0;
    const ratio = (v - s) / v;
    return ratio * ratio * b;
  };

  const bidScorePerShare = scoreAt(input.bidDistanceFromMid);
  const askScorePerShare = scoreAt(input.askDistanceFromMid);
  const qBid = Math.max(0, input.bidSizeShares) * bidScorePerShare;
  const qAsk = Math.max(0, input.askSizeShares) * askScorePerShare;
  const p = input.midProbability;

  const effectiveWeightedScore =
    p >= 0.10 && p <= 0.90
      ? Math.max(Math.min(qBid, qAsk), Math.max(qBid, qAsk) / c)
      : Math.min(qBid, qAsk);

  return { bidScorePerShare, askScorePerShare, effectiveWeightedScore };
}

/** Calculate maker rebate from taker fees collected. */
export function calcMakerRebate(category: PolymarketCategory, takerFeeCollected: number): number {
  return takerFeeCollected * FEE_SCHEDULES[category].makerRebatePct;
}

/** Total cost for a taker order including dynamic fee. */
export function netCostTaker(amount: number, category: PolymarketCategory, probability: number): number {
  return amount * (1 + calcTakerFee(category, probability));
}

/** Estimated net profit for a maker order including rebate. */
export function netProfitMaker(
  amount: number,
  category: PolymarketCategory,
  estimatedTakerVolume: number,
  probability = 0.5,
): number {
  const feeRate = calcTakerFee(category, probability);
  return amount + estimatedTakerVolume * feeRate * FEE_SCHEDULES[category].makerRebatePct;
}
