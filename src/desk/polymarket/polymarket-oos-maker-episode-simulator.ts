/**
 * Log-Odds Avellaneda-Stoikov maker episode simulator for the Polymarket
 * walk-forward OOS evaluator.
 *
 * A passive maker only books a fill when (a) the book shows enough depth for a
 * full pair, (b) its own minimum net spread clears, and (c) the conservative queue
 * simulation says the queue ahead of it actually clears this episode. The fill is
 * then partial: it is capped by the queue simulator, never by the requested leg.
 *
 * Includes competitive liquidity reward dilution (`0.30-0.50` of estimated pool)
 * and tracks 60-second post-fill adverse markout loss so the walk-forward
 * evaluator can verify the `>= 1.5x` markout coverage criterion.
 */

import type { PolymarketCategory } from './polymarket-fee-calculator';
import { calcMakerRebateV2, calcQuadraticTakerFeeRateV2 } from './polymarket-fee-calculator';
import {
  advanceConservativeMakerQueue,
  LogOddsAvellanedaStoikovMarketMaker,
} from './log-odds-avellaneda-stoikov-mm';
import type { SyntheticMarketSnapshot } from './polymarket-oos-synthetic-market';
import { nextRand, type LinearCongruentialState } from './polymarket-oos-deterministic-rng';

export interface MakerEpisodeOptions {
  /** Competitive dilution factor in [0.30, 0.50] applied to estimated liquidity rewards (default 0.40). */
  competitiveDilutionFactor?: number;
}

/** One simulated episode outcome shared by every walk-forward candidate. */
export interface EpisodeOutcome {
  traded: boolean;
  grossPnl: number;
  fees: number;
  unwindLoss: number;
  netPnl: number;
  discountedLiquidityReward?: number;
  markoutLoss60s?: number;
  makerRevenueUsdc?: number;
}

const LOG_ODDS_MM = new LogOddsAvellanedaStoikovMarketMaker();

export function simulateMakerEpisode(
  snap: SyntheticMarketSnapshot,
  pairCount: number,
  minNetSpread: number,
  category: PolymarketCategory,
  candidateRng: LinearCongruentialState,
  options?: MakerEpisodeOptions,
): EpisodeOutcome {
  const noTrade: EpisodeOutcome = {
    traded: false,
    grossPnl: 0,
    fees: 0,
    unwindLoss: 0,
    netPnl: 0,
    discountedLiquidityReward: 0,
    markoutLoss60s: 0,
    makerRevenueUsdc: 0,
  };
  if (snap.yesAskTokens < pairCount || snap.noAskTokens < pairCount) return noTrade;

  const yesMid = (snap.yesBid + snap.yesAsk) / 2;
  const quote = LOG_ODDS_MM.quotePair({
    midProbability: yesMid, yangZhangVarianceDaily: 0.04, inventoryShares: 0, ofiNormalized: 0.10, currentVpin: 0.25,
  });
  if (quote.halfSpreadProbability * 2 < minNetSpread) return noTrade;

  const levelTradeShares = Math.round(
    snap.yesAskTokens * 0.08 + nextRand(candidateRng) * snap.yesAskTokens * 0.22,
  );
  const queueSim = advanceConservativeMakerQueue(
    snap.queueAheadShares, levelTradeShares, Math.round(snap.yesAskTokens * 0.15), 0.20,
  );
  if (!queueSim.queueClearedForOurFill || queueSim.filledShares < 1) return noTrade;

  const filledLegs = Math.min(pairCount, queueSim.filledShares);
  const rebate = calcMakerRebateV2(category, yesMid, filledLegs * 2);
  const rawDilution = options?.competitiveDilutionFactor ?? 0.40;
  const dilutionFactor = Math.min(0.50, Math.max(0.30, rawDilution));
  const rawPoolRewardPerEpisode = filledLegs * (quote.askProbability - quote.bidProbability) * 0.25;
  const discountedLiquidityReward = rawPoolRewardPerEpisode * dilutionFactor;
  const spreadCapture = filledLegs * (quote.askProbability - quote.bidProbability) * 0.35;
  const makerRevenueUsdc = spreadCapture + rebate + discountedLiquidityReward;
  const feeRateYes = calcQuadraticTakerFeeRateV2(category, snap.yesAsk);
  const adverseDrift = (nextRand(candidateRng) - 0.48) * 0.06 * 1.25;
  const filledBidProb = quote.bidProbability + adverseDrift;
  const inventoryResidual = filledLegs * (filledBidProb - quote.bidProbability);
  const markoutLoss60s = Math.max(0, Math.abs(inventoryResidual) * 0.45);

  if (snap.leg2Reject) {
    const unwindFees = filledLegs * Math.max(0, filledBidProb) * feeRateYes;
    return {
      traded: true,
      grossPnl: makerRevenueUsdc,
      fees: unwindFees,
      unwindLoss: Math.max(0, -inventoryResidual),
      netPnl: makerRevenueUsdc - unwindFees + inventoryResidual,
      discountedLiquidityReward,
      markoutLoss60s,
      makerRevenueUsdc,
    };
  }
  return {
    traded: true,
    grossPnl: makerRevenueUsdc,
    fees: 0,
    unwindLoss: 0,
    netPnl: makerRevenueUsdc - Math.max(0, inventoryResidual),
    discountedLiquidityReward,
    markoutLoss60s,
    makerRevenueUsdc,
  };
}
