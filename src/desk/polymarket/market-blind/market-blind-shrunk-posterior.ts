/**
 * Bayesian Logit-Pool Shrunk Fair-Value & Hard Skill Gate (IC Report Strategy 6).
 *
 * Implements:
 *   logit(p_post) = logit(p_mkt) + w_skill(C) * (logit(p_cal) - logit(p_mkt))
 * with fail-closed `w_skill = 0` logging-only kill-switch whenever OOS sample
 * size, BSS_OOS, 95% lower bound, ECE, or rolling 100-market Brier degrades.
 */

import { logit, sigmoid } from './market-blind-calibrator';
import { verifySealedForecastReceipt } from './market-blind-prospective-ledger';
import {
  DEFAULT_POSTERIOR_CONFIG,
  MarketBlindError,
  type CalibrationMetrics,
  type MarketBlindExecutionStyle,
  type MarketBlindPosteriorConfig,
  type ProposalRejectionReason,
  type ShrunkPosteriorInput,
  type ShrunkPosteriorResult,
  type SkillGateFailureReason,
} from './market-blind-types';

const Z_CONSERVATIVE = 1.645;

/** Evaluates the 4-way OOS skill gate and computes `w_skill(C)` (0 on any failure). */
export function evaluateSkillGate(
  metrics: CalibrationMetrics,
  config: Partial<MarketBlindPosteriorConfig> = {},
): { passed: boolean; wSkill: number; reasons: SkillGateFailureReason[] } {
  const cfg: MarketBlindPosteriorConfig = { ...DEFAULT_POSTERIOR_CONFIG, ...config };
  const reasons: SkillGateFailureReason[] = [];

  if (!Number.isFinite(metrics.resolvedCount) || metrics.resolvedCount < cfg.minResolvedQuestions) {
    reasons.push('INSUFFICIENT_RESOLVED_SAMPLES');
  }
  if (!Number.isFinite(metrics.bssOos) || metrics.bssOos < cfg.minBssOos) {
    reasons.push('INSUFFICIENT_BSS_OOS');
  }
  if (!Number.isFinite(metrics.bssLower95) || metrics.bssLower95 <= 0) {
    reasons.push('NON_POSITIVE_BSS_LOWER95');
  }
  if (!Number.isFinite(metrics.ece) || metrics.ece >= cfg.maxEce) {
    reasons.push('EXCESSIVE_ECE');
  }
  if (!Number.isFinite(metrics.rolling100ModelBrier) ||
      !Number.isFinite(metrics.rolling100MarketBrier) ||
      metrics.rolling100ModelBrier >= metrics.rolling100MarketBrier) {
    reasons.push('ROLLING_100_BRIER_WORSE_THAN_MARKET');
  }

  if (reasons.length > 0) {
    return { passed: false, wSkill: 0, reasons };
  }
  const denom = metrics.bssOos + cfg.shrinkageTau;
  const rawWeight = denom > 0 ? metrics.bssOos / denom : 0;
  const wSkill = Math.min(cfg.wMax, Math.max(0, rawWeight));
  return { passed: wSkill > 0, wSkill, reasons };
}

function validateOpenProb(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `${label} must lie in (0, 1); got ${value}`);
  }
}

function computePostOnlyPrice(askPrice: number, bestBid: number | undefined, tickSize: number): number {
  const snapDown = (v: number): number => Math.floor((v + 1e-9) / tickSize) * tickSize;
  const maxMaker = Math.max(tickSize, Number(snapDown(askPrice - tickSize).toFixed(6)));
  if (bestBid !== undefined && Number.isFinite(bestBid) && bestBid > 0) {
    return Math.min(maxMaker, Number(snapDown(bestBid + tickSize).toFixed(6)));
  }
  return maxMaker < askPrice ? maxMaker : Math.max(1e-6, Number((askPrice * 0.5).toFixed(6)));
}

/**
 * Computes shrunk Bayesian posterior `p_post` and conservative trade proposal.
 * Requires a cryptographically verified `SealedForecastReceipt` committed BEFORE
 * reading `marketPrice`.
 */
export function computeShrunkPosterior(
  input: ShrunkPosteriorInput,
  config: Partial<MarketBlindPosteriorConfig> = {},
): ShrunkPosteriorResult {
  verifySealedForecastReceipt(input.receipt);
  if (input.marketObservedAtMs !== undefined) {
    if (!Number.isFinite(input.marketObservedAtMs) || input.marketObservedAtMs < input.receipt.loggedAtMs) {
      throw new MarketBlindError(
        'UNSEALED_FORECAST_RECEIPT',
        `Market observation (${input.marketObservedAtMs}) precedes forecast commit (${input.receipt.loggedAtMs})`,
      );
    }
  }
  const cfg: MarketBlindPosteriorConfig = { ...DEFAULT_POSTERIOR_CONFIG, ...config };
  validateOpenProb('marketPrice', input.marketPrice);
  validateOpenProb('pCal', input.pCal);
  const askPrice = input.askPrice ?? input.marketPrice;
  validateOpenProb('askPrice', askPrice);
  const sigmaPost = input.sigmaPost ?? 0;
  const takerFee = input.takerFeePerShare ?? 0;
  const inferenceCost = input.inferenceCostPusd ?? 0;
  if (!Number.isFinite(sigmaPost) || sigmaPost < 0 ||
      !Number.isFinite(takerFee) || takerFee < 0 ||
      !Number.isFinite(inferenceCost) || inferenceCost < 0) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'sigmaPost, takerFeePerShare, and inferenceCostPusd must be >= 0');
  }

  const gate = evaluateSkillGate(input.metrics, cfg);
  const { wSkill } = gate;
  const loggingOnly = wSkill === 0;
  const pPost = loggingOnly
    ? input.marketPrice
    : sigmoid(logit(input.marketPrice) + wSkill * (logit(input.pCal) - logit(input.marketPrice)));

  const edgeCons = (pPost - Z_CONSERVATIVE * sigmaPost) - askPrice;
  const netEdgeAfterTaker = edgeCons - takerFee;

  let rejection: ProposalRejectionReason | null = null;
  if (loggingOnly) {
    rejection = 'SKILL_GATE_LOCKED';
  } else if (input.marketPrice < cfg.minMarketPrice || input.marketPrice > cfg.maxMarketPrice) {
    rejection = 'MARKET_PRICE_OUTSIDE_BAND';
  } else if (edgeCons < cfg.minConservativeEdge) {
    rejection = 'INSUFFICIENT_CONSERVATIVE_EDGE';
  }

  const notional = input.notionalPusd ?? (inferenceCost === 0 ? 1_000 : 0);
  if (rejection === null && (!(notional > 0) || inferenceCost > cfg.maxInferenceCostFraction * notional)) {
    rejection = 'INFERENCE_COST_CAP_EXCEEDED';
  }

  if (rejection !== null) {
    return {
      pPost, pCal: input.pCal, marketPrice: input.marketPrice, wSkill, loggingOnly,
      skillGateReasons: gate.reasons, edgeCons, netEdgeAfterTaker,
      proposal: null, proposalRejectionReason: rejection,
    };
  }

  const executionStyle: MarketBlindExecutionStyle =
    netEdgeAfterTaker >= cfg.minTakerNetEdge ? 'taker' : 'post-only-improve-1tick';
  const limitPrice = executionStyle === 'taker'
    ? askPrice
    : computePostOnlyPrice(askPrice, input.bestBid, cfg.tickSize);

  return {
    pPost,
    pCal: input.pCal,
    marketPrice: input.marketPrice,
    wSkill,
    loggingOnly: false,
    skillGateReasons: [],
    edgeCons,
    netEdgeAfterTaker,
    proposal: {
      questionId: input.receipt.questionId,
      category: input.receipt.category,
      executionStyle,
      limitPrice,
      pPost,
      wSkill,
      edgeCons,
      netEdgeAfterTaker,
      notionalPusd: notional,
      inferenceCostPusd: inferenceCost,
      inferenceCostFraction: inferenceCost / notional,
    },
    proposalRejectionReason: null,
  };
}
